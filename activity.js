const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField, 
    MessageFlags,
    ComponentType 
} = require('discord.js');

// ==========================================
// KONFIGURACJA UPRAWNIEŃ
// ==========================================
const ALLOWED_ROLES = [
    '1447757045947174972', 
    '1447764029882896487', 
    '1447970901575471286', 
    '1446904206903742534'  
];

function checkPermissions(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

// Mapa sesji sprawdzania
// Key: ChannelID (nie MessageID, dla łatwiejszego dostępu z eventu), Value: { messageId: string, interval: IntervalID, visited: Set<UserID>, roleId: string }
const activeSessions = new Map();

// ==========================================
// DEFINICJA KOMENDY
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('aktywnosc-ch')
        .setDescription('Tworzy listę obecności (zapamiętuje każdego, kto wszedł)')
        .addChannelOption(option => 
            option.setName('kanal')
                .setDescription('Kanał głosowy do sprawdzania')
                .addChannelTypes(2) // 2 = GuildVoice
                .setRequired(true))
        .addRoleOption(option => 
            option.setName('ranga')
                .setDescription('Ranga, którą sprawdzamy')
                .setRequired(true))
];

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================

async function generateStatusEmbed(guild, targetChannel, targetRole, visitedSet) {
    await guild.members.fetch(); 

    const allRoleMembers = targetRole.members.filter(m => !m.user.bot);
    
    // Awaryjna aktualizacja (gdyby event nie zadziałał)
    targetChannel.members.forEach(member => {
        if (member.roles.cache.has(targetRole.id)) {
            visitedSet.add(member.id);
        }
    });

    const presentList = [];
    const absentList = [];

    allRoleMembers.forEach(member => {
        if (visitedSet.has(member.id)) {
            const isOnlineNow = member.voice.channelId === targetChannel.id;
            const statusIcon = isOnlineNow ? '🟢' : '⚪';
            presentList.push(`${statusIcon} ${member.toString()}`);
        } else {
            absentList.push(`❌ ${member.toString()}`);
        }
    });

    const total = allRoleMembers.size;
    const presentCount = visitedSet.size;
    const percent = total > 0 ? Math.round((presentCount / total) * 100) : 0;

    const formatList = (list) => {
        if (list.length === 0) return "-(Brak)-";
        const str = list.join('\n'); 
        return str.length > 1000 ? str.substring(0, 997) + "..." : str;
    };

    const embed = new EmbedBuilder()
        .setTitle(`📋 Lista Obecności: ${targetChannel.name}`)
        .setDescription(`**Ranga:** ${targetRole}\n**Zasada:** Kto wejdzie na kanał, zostaje odhaczony na stałe.\n**Status:** 🟢 TRWA SPRAWDZANIE (Live)`)
        .setColor('Blue')
        .addFields(
            { name: `✅ Obecni (Kiedykolwiek): ${presentCount}/${total} (${percent}%)`, value: formatList(presentList), inline: true },
            { name: `❌ Nieobecni (Ani razu): ${total - presentCount}`, value: formatList(absentList), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: '🟢 = Jest teraz na kanale | ⚪ = Był, ale wyszedł' });

    return embed;
}

// ==========================================
// NOWY EVENT HANDLER (DLA INDEX.JS)
// ==========================================
// Ta funkcja musi być wywołana w index.js w zdarzeniu voiceStateUpdate!
async function handleVoiceStateUpdate(oldState, newState) {
    // Sprawdzamy czy ktoś wszedł na kanał, który jest monitorowany
    if (newState.channelId) {
        const session = activeSessions.get(newState.channelId);
        
        if (session) {
            // Sprawdzamy czy ta osoba ma wymaganą rangę
            if (newState.member.roles.cache.has(session.roleId)) {
                // Dodajemy do odwiedzonych NATYCHMIAST
                session.visited.add(newState.member.id);
            }
        }
    }
}

// ==========================================
// OBSŁUGA INTERAKCJI
// ==========================================
async function handleInteraction(interaction, client) {
    
    // 1. KOMENDA /aktywnosc-ch
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'aktywnosc-ch') {
            if (!checkPermissions(interaction.member)) {
                return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            }

            const targetChannel = interaction.options.getChannel('kanal');
            const targetRole = interaction.options.getRole('ranga');

            // Jeśli już jest sesja na tym kanale, usuwamy ją
            if (activeSessions.has(targetChannel.id)) {
                const oldSession = activeSessions.get(targetChannel.id);
                clearInterval(oldSession.interval);
                activeSessions.delete(targetChannel.id);
            }

            const visitedSet = new Set();

            // Dodajemy tych co już są
            targetChannel.members.forEach(member => {
                if (member.roles.cache.has(targetRole.id)) {
                    visitedSet.add(member.id);
                }
            });

            const embed = await generateStatusEmbed(interaction.guild, targetChannel, targetRole, visitedSet);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`stop_activity_check:${targetChannel.id}`) // Dodajemy ID kanału do przycisku
                    .setLabel('ZAKOŃCZ SPRAWDZANIE')
                    .setStyle(ButtonStyle.Danger)
            );

            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            // Timer służy teraz tylko do odświeżania wyglądu (wizualizacji), dane zbiera event
            const interval = setInterval(async () => {
                try {
                    const fetchedMsg = await interaction.channel.messages.fetch(message.id).catch(() => null);
                    
                    if (!fetchedMsg) {
                        clearInterval(interval);
                        activeSessions.delete(targetChannel.id);
                        return;
                    }

                    const newEmbed = await generateStatusEmbed(interaction.guild, targetChannel, targetRole, visitedSet);
                    await fetchedMsg.edit({ embeds: [newEmbed] });

                } catch (e) {
                    console.error("Błąd activity:", e);
                    clearInterval(interval);
                    activeSessions.delete(targetChannel.id);
                }
            }, 3000); // Odświeżanie wyglądu co 3s

            // Zapisujemy sesję pod ID KANAŁU
            activeSessions.set(targetChannel.id, { 
                messageId: message.id, 
                interval, 
                visited: visitedSet,
                roleId: targetRole.id
            });
            return true;
        }
    }

    // 2. PRZYCISK STOP
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('stop_activity_check')) {
            if (!checkPermissions(interaction.member)) {
                return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            }

            // Wyciągamy ID kanału z przycisku
            const channelId = interaction.customId.split(':')[1];

            if (activeSessions.has(channelId)) {
                const session = activeSessions.get(channelId);
                clearInterval(session.interval);
                activeSessions.delete(channelId);
            } else {
                // Jeśli sesja wygasła, ale przycisk został
                return interaction.reply({ content: '⚠️ Ta sesja już wygasła.', flags: MessageFlags.Ephemeral });
            }

            const oldEmbed = interaction.message.embeds[0];
            const finalEmbed = new EmbedBuilder(oldEmbed.data)
                .setDescription(oldEmbed.description.replace('🟢 TRWA SPRAWDZANIE (Live)', '🔴 SPRAWDZANIE ZAKOŃCZONE'))
                .setColor('Red')
                .setFooter({ text: `Zakończono przez: ${interaction.user.tag} • ${new Date().toLocaleTimeString()}` });

            await interaction.update({ embeds: [finalEmbed], components: [] });
            return true;
        }
    }

    return false;
}

module.exports = {
    commands,
    handleInteraction,
    handleVoiceStateUpdate // WAŻNE: To trzeba podłączyć w index.js
};