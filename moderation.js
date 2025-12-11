const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField, 
    MessageFlags 
} = require('discord.js');

// ==========================================
// PAMIĘĆ MODERACJI
// ==========================================
// Przechowuje informacje o wyciszonych kanałach: 
// Key: ChannelID, Value: { mode: 'all-time'|'one', roleId: string|null, ownerId: string }
const persistentMutes = new Map();

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

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createEmbedModal(targetChannelId) {
    const modal = new ModalBuilder()
        .setCustomId(`embedModal:${targetChannelId}`)
        .setTitle('Kreator Embedów');

    const inputs = [
        new TextInputBuilder().setCustomId('embedTitle').setLabel("Tytuł").setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('embedDesc').setLabel("Opis").setStyle(TextInputStyle.Paragraph).setRequired(true),
        new TextInputBuilder().setCustomId('embedColor').setLabel("Kolor").setStyle(TextInputStyle.Short).setPlaceholder('Blue').setRequired(false),
        new TextInputBuilder().setCustomId('embedImage').setLabel("Obrazek (URL)").setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('embedFooter').setLabel("Stopka").setStyle(TextInputStyle.Short).setRequired(false)
    ];

    inputs.forEach(input => modal.addComponents(new ActionRowBuilder().addComponents(input)));
    return modal;
}

async function handleMassDm(source, role, contentToSend) {
    const member = source.member;
    
    if (!checkPermissions(member)) {
        const msg = '⛔ Nie masz uprawnień do tej komendy.';
        if (source.reply) return source.reply({ content: msg, flags: MessageFlags.Ephemeral });
        return;
    }

    if (source.isCommand && source.isCommand()) {
        await source.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const guild = source.guild;
    await guild.members.fetch();
    const membersWithRole = role.members.filter(m => !m.user.bot);
    const recipientsCount = membersWithRole.size;

    if (recipientsCount === 0) {
        const msg = 'Nikt nie posiada tej rangi.';
        if (source.isCommand && source.isCommand()) return source.editReply(msg);
        return source.reply(msg);
    }

    const SAFE_MODE_LIMIT = 40;
    const useSleep = recipientsCount > SAFE_MODE_LIMIT;
    let infoMessage = `Rozpoczynam wysyłanie do **${recipientsCount}** osób z rangą **${role.name}**...`;
    if (useSleep) infoMessage += `\n⚠️ **Limit 40+:** Tryb bezpieczny (2s przerwy).`;

    if (source.isCommand && source.isCommand()) await source.editReply(infoMessage);
    else await source.reply(infoMessage);

    let sentCount = 0;
    let errorCount = 0;

    for (const [memberId, targetMember] of membersWithRole) {
        try {
            await targetMember.send(`**Wiadomość od administracji:**\n${contentToSend}`);
            sentCount++;
            if (useSleep) await sleep(2000); 
        } catch (error) { errorCount++; }
    }

    const finalMsg = `✅ Zakończono!\nWysłano: ${sentCount}\nZablokowane PW: ${errorCount}`;
    if (source.isCommand && source.isCommand()) await source.editReply({ content: finalMsg });
    else await source.channel.send(finalMsg);
}

// ==========================================
// DEFINICJE KOMEND
// ==========================================
const commands = [
    new SlashCommandBuilder().setName('pw').setDescription('Masowa wiadomość DM').addRoleOption(o => o.setName('ranga').setDescription('Ranga').setRequired(true)).addStringOption(o => o.setName('wiadomosc').setDescription('Treść').setRequired(true)),
    new SlashCommandBuilder().setName('fembed').setDescription('Kreator Embedów').addChannelOption(o => o.setName('kanal').setDescription('Gdzie wysłać?')),
    new SlashCommandBuilder()
        .setName('giverole')
        .setDescription('Nadawanie roli masowo')
        .addRoleOption(option => option.setName('rola').setDescription('Rola do nadania').setRequired(true))
        .addRoleOption(option => option.setName('cel').setDescription('Komu nadać? (Brak = Wszyscy)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('ungiverole')
        .setDescription('Masowe usuwanie roli')
        .addRoleOption(option => option.setName('rola').setDescription('Rola do usunięcia').setRequired(true))
        .addRoleOption(option => option.setName('cel').setDescription('Komu usunąć? (Brak = Wszyscy)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('moveall-ch')
        .setDescription('Przenosi użytkowników do Twojego kanału głosowego')
        .addRoleOption(option => option.setName('ranga').setDescription('Przenieś tylko osoby z tą rangą (Opcjonalne)').setRequired(false))
        .addUserOption(option => option.setName('osoba').setDescription('Do kogo przenieść? (Domyślnie: do Ciebie)').setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('muteall-ch')
        .setDescription('Wycisza użytkowników na kanale głosowym')
        .addRoleOption(option => option.setName('ranga').setDescription('Wycisz tylko tę rangę (Opcjonalne)').setRequired(false))
        .addStringOption(option => 
            option.setName('tryb')
                .setDescription('Tryb wyciszenia (Opcjonalne)')
                .setRequired(false)
                .addChoices(
                    { name: 'Cały czas (ch-all-time)', value: 'all-time' },
                    { name: 'Do wyjścia admina (one)', value: 'one' }
                )
        ),
    new SlashCommandBuilder()
        .setName('unmuteall-ch')
        .setDescription('Odcisza wszystkich na serwerze i usuwa blokady kanałów')
];

// ==========================================
// OBSŁUGA INTERAKCJI
// ==========================================
async function handleInteraction(interaction, client) {
    if (interaction.isButton()) {
        if (interaction.customId === 'openEmbedModal') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            return await interaction.showModal(createEmbedModal(interaction.channelId));
        }
    }

    if (interaction.isChatInputCommand()) {
        // --- MUTEALL-CH ---
        if (interaction.commandName === 'muteall-ch') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym.', flags: MessageFlags.Ephemeral });

            const targetRole = interaction.options.getRole('ranga');
            const mode = interaction.options.getString('tryb'); // 'all-time' lub 'one' lub null

            await interaction.deferReply();

            // Zapisujemy blokadę
            if (mode) {
                persistentMutes.set(voiceChannel.id, {
                    mode: mode,
                    roleId: targetRole ? targetRole.id : null,
                    ownerId: interaction.user.id
                });
            }

            // Wyciszamy obecnych
            let mutedCount = 0;
            for (const [id, member] of voiceChannel.members) {
                if (member.user.bot) continue; 
                if (member.id === interaction.user.id) continue;
                if (member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;

                if (targetRole && !member.roles.cache.has(targetRole.id)) continue;

                try {
                    await member.voice.setMute(true, `Muteall-ch przez ${interaction.user.tag}`);
                    mutedCount++;
                } catch (e) {}
            }

            let msg = `✅ Wyciszono **${mutedCount}** osób na kanale **${voiceChannel.name}**.`;
            if (targetRole) msg += ` (Tylko ranga: ${targetRole.name})`;
            if (mode === 'all-time') msg += `\n🔒 **Tryb ch-all-time:** Każdy kto wejdzie zostanie wyciszony, a kto wyjdzie - odciszony.`;
            if (mode === 'one') msg += `\n🔒 **Tryb one:** Kanał wyciszony dopóki Ty tu jesteś.`;

            return interaction.editReply(msg);
        }

        // --- UNMUTEALL-CH ---
        if (interaction.commandName === 'unmuteall-ch') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            await interaction.deferReply();

            // 1. Czyszczenie pamięci
            persistentMutes.clear();

            // 2. Odciszanie wszystkich na serwerze
            let unmutedCount = 0;
            const channels = interaction.guild.channels.cache.filter(c => c.isVoiceBased());

            for (const [id, channel] of channels) {
                for (const [mid, member] of channel.members) {
                    if (member.voice.serverMute) {
                        try {
                            await member.voice.setMute(false, `Unmuteall-ch przez ${interaction.user.tag}`);
                            unmutedCount++;
                        } catch (e) {}
                    }
                }
            }

            return interaction.editReply(`✅ Odciszono **${unmutedCount}** osób na całym serwerze.\n🔓 Wszystkie blokady kanałów (ch-all-time/one) zostały zdjęte.`);
        }

        // --- RESZTA STARYCH KOMEND ---
        if (interaction.commandName === 'fembed') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
            await interaction.showModal(createEmbedModal(targetChannel.id));
            return true;
        }

        if (interaction.commandName === 'pw') {
            const role = interaction.options.getRole('ranga');
            const messageContent = interaction.options.getString('wiadomosc');
            await handleMassDm(interaction, role, messageContent);
            return true;
        }

        if (interaction.commandName === 'giverole') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
        
            const roleToGive = interaction.options.getRole('rola');
            const targetRole = interaction.options.getRole('cel');
            
            if (roleToGive.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({ content: '❌ Nie mogę nadać tej roli (jest wyższa lub równa mojej najwyższej roli).', flags: MessageFlags.Ephemeral });
            }
        
            await interaction.deferReply();
        
            let targetMembers;
            if (targetRole) {
                await interaction.guild.members.fetch(); 
                targetMembers = targetRole.members.filter(m => !m.user.bot);
            } else {
                targetMembers = await interaction.guild.members.fetch();
                targetMembers = targetMembers.filter(m => !m.user.bot);
            }
        
            if (!targetMembers || targetMembers.size === 0) {
                return interaction.editReply('❌ Nie znaleziono użytkowników do nadania roli.');
            }
        
            let successCount = 0;
            for (const [id, member] of targetMembers) {
                if (member.roles.cache.has(roleToGive.id)) continue; 
                try {
                    await member.roles.add(roleToGive);
                    successCount++;
                    await sleep(500);
                } catch (e) {}
            }

            await interaction.editReply(`✅ Nadano rolę **${roleToGive.name}** dla **${successCount}** użytkowników.`);
            return true;
        }

        if (interaction.commandName === 'ungiverole') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
        
            const roleToRemove = interaction.options.getRole('rola');
            const targetRole = interaction.options.getRole('cel');
            
            if (roleToRemove.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({ content: '❌ Nie mogę usunąć tej roli.', flags: MessageFlags.Ephemeral });
            }
        
            await interaction.deferReply();
        
            let targetMembers;
            if (targetRole) {
                await interaction.guild.members.fetch(); 
                targetMembers = targetRole.members.filter(m => !m.user.bot);
            } else {
                targetMembers = await interaction.guild.members.fetch();
                targetMembers = targetMembers.filter(m => !m.user.bot);
            }
        
            if (!targetMembers || targetMembers.size === 0) {
                return interaction.editReply('❌ Nie znaleziono użytkowników.');
            }
        
            let successCount = 0;
            for (const [id, member] of targetMembers) {
                if (!member.roles.cache.has(roleToRemove.id)) continue; 
                try {
                    await member.roles.remove(roleToRemove);
                    successCount++;
                    await sleep(500); 
                } catch (e) {}
            }

            await interaction.editReply(`✅ Usunięto rolę **${roleToRemove.name}** od **${successCount}** użytkowników.`);
            return true;
        }

        if (interaction.commandName === 'moveall-ch') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('osoba') || interaction.user;
            const roleFilter = interaction.options.getRole('ranga');
            
            const targetMember = await interaction.guild.members.fetch(targetUser.id);
            const targetChannel = targetMember.voice.channel;

            if (!targetChannel) return interaction.reply({ content: `❌ Cel nie jest na kanale głosowym.`, flags: MessageFlags.Ephemeral });

            await interaction.deferReply();

            const channels = interaction.guild.channels.cache.filter(c => c.isVoiceBased() && c.id !== targetChannel.id);
            let movedCount = 0;

            let membersToMove = [];
            for (const [channelId, channel] of channels) {
                for (const [memberId, member] of channel.members) {
                    if (member.user.bot) continue;
                    if (roleFilter && !member.roles.cache.has(roleFilter.id)) continue;
                    membersToMove.push(member);
                }
            }

            if (membersToMove.length === 0) return interaction.editReply('⚠️ Nikogo nie przeniesiono.');
            
            await interaction.editReply(`🔄 Przenoszę **${membersToMove.length}** osób...`);

            for (const member of membersToMove) {
                try {
                    await member.voice.setChannel(targetChannel);
                    movedCount++;
                    await sleep(200); 
                } catch (e) {}
            }

            await interaction.editReply(`✅ Przeniesiono: **${movedCount}** osób.`);
            return true;
        }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('embedModal')) {
        const targetChannelId = interaction.customId.split(':')[1];
        const title = interaction.fields.getTextInputValue('embedTitle');
        const desc = interaction.fields.getTextInputValue('embedDesc');
        let color = interaction.fields.getTextInputValue('embedColor') || 'Blue';
        const image = interaction.fields.getTextInputValue('embedImage');
        const footer = interaction.fields.getTextInputValue('embedFooter');

        const embed = new EmbedBuilder().setDescription(desc).setColor(color);
        if (title) embed.setTitle(title);
        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });

        try {
            const channel = await client.channels.fetch(targetChannelId);
            await channel.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ Wysłano na ${channel}.`, flags: MessageFlags.Ephemeral });
        } catch (err) { await interaction.reply({ content: '❌ Błąd.', flags: MessageFlags.Ephemeral }); }
        return true;
    }

    return false;
}

// ==========================================
// HANDLE VOICE UPDATE (KLUCZOWA FUNKCJA)
// ==========================================
async function handleVoiceStateUpdate(oldState, newState) {
    
    // 1. ODCISZANIE PRZY WYJŚCIU Z KANAŁU
    // Jeśli użytkownik wychodzi z jakiegoś kanału (oldState.channelId)
    // I ten kanał różni się od nowego (czyli nie jest to tylko zmiana statusu kamery/mikrofonu)
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        
        // Sprawdzamy, czy stary kanał był na liście zablokowanych
        const config = persistentMutes.get(oldState.channelId);
        if (config) {
            
            // Specjalny przypadek: Wychodzi właściciel blokady w trybie 'one'
            if (config.mode === 'one' && oldState.member.id === config.ownerId) {
                // Usuwamy blokadę
                persistentMutes.delete(oldState.channelId);
                
                // Odciszamy wszystkich, którzy zostali na kanale
                const channel = oldState.channel;
                for (const [id, member] of channel.members) {
                    if (member.voice.serverMute) {
                        try {
                            await member.voice.setMute(false, 'Auto-Unmute: Koniec trybu one');
                        } catch (e) {}
                    }
                }
            } 
            // Normalny przypadek: Zwykły użytkownik opuszcza wyciszony kanał
            else {
                // Jeśli był wyciszony przez serwer, odciszamy go, bo wyszedł ze "strefy ciszy"
                if (oldState.serverMute) {
                    try {
                        await oldState.member.voice.setMute(false, 'Auto-Unmute: Wyjście ze strefy');
                    } catch (e) {}
                }
            }
        }
    }

    // 2. WYCISZANIE PRZY WEJŚCIU NA KANAŁ
    if (newState.channelId && newState.channelId !== oldState.channelId) {
        const config = persistentMutes.get(newState.channelId);
        
        if (config) {
            const member = newState.member;

            // Sprawdzamy wyjątki (admin, właściciel blokady)
            if (member.id === config.ownerId) return;
            if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
            
            // Jeśli jest filtr rangi i user jej nie ma -> nie wyciszamy
            if (config.roleId && !member.roles.cache.has(config.roleId)) return;

            // Wyciszamy
            if (!member.voice.serverMute) {
                try {
                    await member.voice.setMute(true, 'Auto-Mute: Wejście do strefy');
                } catch (e) {}
            }
        }
    }
}

// ==========================================
// OBSŁUGA WIADOMOŚCI (TEXT COMMANDS)
// ==========================================
async function handleMessage(message) {
    if (message.content === '!fembed') {
        if (!checkPermissions(message.member)) return message.reply('⛔ Brak uprawnień.');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('openEmbedModal').setLabel('Stwórz').setStyle(ButtonStyle.Primary));
        await message.reply({ content: 'Otwórz kreator:', components: [row] });
        return true;
    }
    if (message.content.startsWith('!pw')) {
        const args = message.content.split(' ');
        if (args.length < 3) return message.reply('Użycie: `!pw @Ranga Wiadomość`');
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) return message.reply('Brak rangi.');
        await handleMassDm(message, role, args.slice(2).join(' '));
        return true;
    }
    return false;
}

module.exports = {
    commands,
    handleInteraction,
    handleMessage,
    handleVoiceStateUpdate
};