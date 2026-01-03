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
// Key: MessageID, Value: { interval: IntervalID, visited: Set<UserID> }
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
    await guild.members.fetch(); // Odświeżamy cache

    // 1. Zbieramy wszystkich z rangą (bez botów)
    const allRoleMembers = targetRole.members.filter(m => !m.user.bot);
    
    // 2. Aktualizujemy listę odwiedzonych na podstawie tego, kto jest TERAZ na kanale
    // (To zabezpiecza nas, gdyby event update nie zadziałał idealnie, sprawdzamy to co 5s)
    targetChannel.members.forEach(member => {
        if (member.roles.cache.has(targetRole.id)) {
            visitedSet.add(member.id);
        }
    });

    const presentList = []; // Ci co byli/są
    const absentList = [];  // Ci co ani razu nie weszli

    allRoleMembers.forEach(member => {
        if (visitedSet.has(member.id)) {
            // Dodatkowo sprawdzamy czy jest TERAZ online na kanale dla lepszego efektu
            const isOnlineNow = member.voice.channelId === targetChannel.id;
            // Możemy dodać kropkę, np. 🟢 jeśli jest teraz, ⚪ jeśli był i wyszedł
            const statusIcon = isOnlineNow ? '🟢' : '⚪';
            presentList.push(`${statusIcon} ${member.toString()}`);
        } else {
            absentList.push(`❌ ${member.toString()}`);
        }
    });

    const total = allRoleMembers.size;
    const presentCount = visitedSet.size;
    const percent = total > 0 ? Math.round((presentCount / total) * 100) : 0;

    // Formatowanie długich list
    const formatList = (list) => {
        if (list.length === 0) return "-(Brak)-";
        const str = list.join('\n'); // Lepiej w nowej linii dla czytelności
        return str.length > 1000 ? str.substring(0, 997) + "..." : str;
    };

    const embed = new EmbedBuilder()
        .setTitle(`📋 Lista Obecności: ${targetChannel.name}`)
        .setDescription(`**Ranga:** ${targetRole}\n**Zasada:** Kto wejdzie na kanał, zostaje odhaczony na stałe.\n**Status:** 🟢 TRWA SPRAWDZANIE...`)
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

            // Inicjalizujemy pusty zbiór odwiedzonych
            const visitedSet = new Set();

            // Pierwsze sprawdzenie (dodajemy tych co już tam siedzą)
            targetChannel.members.forEach(member => {
                if (member.roles.cache.has(targetRole.id)) {
                    visitedSet.add(member.id);
                }
            });

            // Generujemy pierwszy embed
            const embed = await generateStatusEmbed(interaction.guild, targetChannel, targetRole, visitedSet);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('stop_activity_check')
                    .setLabel('ZAKOŃCZ SPRAWDZANIE')
                    .setStyle(ButtonStyle.Danger)
            );

            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            // Uruchamiamy pętlę co 5 sekund
            const interval = setInterval(async () => {
                try {
                    const fetchedMsg = await interaction.channel.messages.fetch(message.id).catch(() => null);
                    
                    // Jeśli wiadomość usunięta - czyścimy pamięć
                    if (!fetchedMsg) {
                        clearInterval(interval);
                        activeSessions.delete(message.id);
                        return;
                    }

                    // Generujemy zaktualizowany embed (przekazujemy visitedSet)
                    const newEmbed = await generateStatusEmbed(interaction.guild, targetChannel, targetRole, visitedSet);
                    
                    await fetchedMsg.edit({ embeds: [newEmbed] });

                } catch (e) {
                    console.error("Błąd activity:", e);
                    clearInterval(interval);
                    activeSessions.delete(message.id);
                }
            }, 5000);

            // Zapisujemy sesję
            activeSessions.set(message.id, { interval, visited: visitedSet });
            return true;
        }
    }

    // 2. PRZYCISK STOP
    if (interaction.isButton()) {
        if (interaction.customId === 'stop_activity_check') {
            if (!checkPermissions(interaction.member)) {
                return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            }

            const messageId = interaction.message.id;

            if (activeSessions.has(messageId)) {
                const session = activeSessions.get(messageId);
                clearInterval(session.interval);
                activeSessions.delete(messageId);
            }

            // Finalizacja embeda
            const oldEmbed = interaction.message.embeds[0];
            const finalEmbed = new EmbedBuilder(oldEmbed.data)
                .setDescription(oldEmbed.description.replace('🟢 TRWA SPRAWDZANIE...', '🔴 SPRAWDZANIE ZAKOŃCZONE'))
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
    handleInteraction
};