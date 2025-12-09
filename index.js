const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa (Wersja ULTIMATE)!'));
app.listen(port, () => console.log(`Nasłuchiwanie na porcie ${port}`));

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionsBitField,
    Events,
    MessageFlags 
} = require('discord.js');
const { Kazagumo } = require("kazagumo");
const { Connectors } = require("shoukaku");

// ==========================================
// PAMIĘĆ BOTA
// ==========================================
const twentyFourSeven = new Map(); 
const emptyTimers = new Map();     
const lastPanelMessage = new Map(); 

// ==========================================
// KONFIGURACJA UPRAWNIEŃ (4 ROLE)
// ==========================================
const ALLOWED_ROLES = [
    '1447757045947174972', 
    '1447764029882896487', 
    '1447970901575471286', 
    '1446904206903742534'  
];

const GUILD_ID = 'WKLEJ_TUTAJ_ID_SWOJEGO_SERWERA'; 

function checkPermissions(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

// ==========================================
// KONFIGURACJA LAVALINK (MULTI-NODE)
// ==========================================
const NODES = [
    // 1. GŁÓWNY
    {
        name: 'AjieDev-V4', 
        url: 'lava-v4.ajieblogs.eu.org:443', 
        auth: 'https://dsc.gg/ajidevserver', 
        secure: true 
    },
    // 2. ZAPASOWY 1
    {
        name: 'Serenetia-V4',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    },
    // 3. ZAPASOWY 2
    {
        name: 'Fedot_Compot',
        url: 'lavalink.fedotcompot.net:443',
        auth: 'https://discord.gg/bXXCZzKAyp',
        secure: true
    }
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const kazagumo = new Kazagumo({
    defaultSearchEngine: "youtube", 
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), NODES, {
    extends: {
        player: {
            savePreviousSongs: true 
        }
    }
});

// ==========================================
// AUTO-FIX: WYRZUCENIE Z KANAŁU
// ==========================================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (oldState.member.id === client.user.id) {
        if (oldState.channelId && !newState.channelId) {
            const player = kazagumo.players.get(oldState.guild.id);
            if (player) {
                console.log(`[Auto-Fix] Bot rozłączony. Niszczę playera.`);
                player.destroy();
                if (lastPanelMessage.has(oldState.guild.id)) lastPanelMessage.delete(oldState.guild.id);
                if (emptyTimers.has(oldState.guild.id)) {
                    clearTimeout(emptyTimers.get(oldState.guild.id));
                    emptyTimers.delete(oldState.guild.id);
                }
            }
        }
    }
});

// ==========================================
// EVENT: START UTWORU (SMART PANEL)
// ==========================================
kazagumo.on("playerStart", async (player, track) => {
    if (emptyTimers.has(player.guildId)) {
        clearTimeout(emptyTimers.get(player.guildId));
        emptyTimers.delete(player.guildId);
    }

    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('🎶 Gramy:')
        .setDescription(`[${track.title}](${track.uri})`)
        .addFields(
            { name: 'Autor', value: track.author || 'Nieznany', inline: true },
            { name: 'Długość', value: track.isStream ? 'LIVE' : new Date(track.length).toISOString().substr(14, 5), inline: true },
            { name: 'Dodał', value: track.requester ? `<@${track.requester.id}>` : 'Ktoś', inline: true }
        )
        .setThumbnail(track.thumbnail || null)
        .setColor('Green');

    let loopStatus = 'OFF';
    if (player.loop === 'queue') loopStatus = 'Kolejka';
    if (player.loop === 'track') loopStatus = 'Utwór';
    
    const is247 = twentyFourSeven.get(player.guildId) || false;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setLabel('Pauza').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setLabel('Skip').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('music_247').setEmoji('🔁').setLabel(is247 ? '24/7: ON' : '24/7: OFF').setStyle(is247 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_queue').setEmoji('📜').setLabel('Lista').setStyle(ButtonStyle.Secondary)
    );

    let footerText = `🔊 Vol: ${player.volume}% | 🔁 Pętla: ${loopStatus}`;
    const nodeName = player.shoukaku.node ? player.shoukaku.node.name : 'Auto';
    footerText += ` | 📡 Node: ${nodeName}`;
    embed.setFooter({ text: footerText });

    // --- LOGIKA SMART PANELU ---
    let messageUpdated = false;
    const lastMsgId = lastPanelMessage.get(player.guildId);

    if (lastMsgId) {
        const lastChannelMsgId = channel.lastMessageId;
        // Jeśli ostatnia wiadomość na kanale to nasz panel -> Edytujemy
        if (lastChannelMsgId === lastMsgId) {
            try {
                const existingMsg = await channel.messages.fetch(lastMsgId);
                if (existingMsg) {
                    await existingMsg.edit({ embeds: [embed], components: [row] });
                    messageUpdated = true;
                }
            } catch (e) { messageUpdated = false; }
        } else {
            // Jeśli ktoś coś napisał -> Usuwamy stary panel
            try {
                const oldMsg = await channel.messages.fetch(lastMsgId).catch(() => null);
                if (oldMsg) await oldMsg.delete();
            } catch (e) {}
        }
    }

    // Jeśli nie edytowaliśmy -> Wysyłamy nowy
    if (!messageUpdated) {
        const msg = await channel.send({ embeds: [embed], components: [row] });
        lastPanelMessage.set(player.guildId, msg.id);
    }
});

kazagumo.on("playerEnd", (player) => {});

kazagumo.on("playerEmpty", async (player) => {
    const channel = client.channels.cache.get(player.textId);
    
    // Usuwamy panel po zakończeniu
    if (lastPanelMessage.has(player.guildId)) {
        const lastMsgId = lastPanelMessage.get(player.guildId);
        try {
            const oldMsg = await channel.messages.fetch(lastMsgId).catch(() => null);
            if (oldMsg) await oldMsg.delete();
        } catch (e) {}
        lastPanelMessage.delete(player.guildId);
    }

    if (twentyFourSeven.get(player.guildId)) {
        if (channel) channel.send("zzz... Kolejka pusta (Tryb 24/7).");
        return; 
    }

    if (channel) channel.send("⏳ Kolejka pusta. Wyjdę za **1 minutę**, jeśli nic nie puścisz.");

    const timer = setTimeout(() => {
        if (!player.queue.length && !player.playing) {
            player.destroy();
            if (channel) channel.send("⏹️ Brak aktywności. Wychodzę.");
            emptyTimers.delete(player.guildId);
        }
    }, 60 * 1000); 

    emptyTimers.set(player.guildId, timer);
});

// LOGOWANIE BŁĘDÓW BEZ CRASHA
kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink Node ${name} jest GOTOWY!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink Node ${name} BŁĄD: ${error.message}`));

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================

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
            if (useSleep) await new Promise(r => setTimeout(r, 2000)); 
        } catch (error) { errorCount++; }
    }

    const finalMsg = `✅ Zakończono!\nWysłano: ${sentCount}\nZablokowane PW: ${errorCount}`;
    if (source.isCommand && source.isCommand()) await source.editReply({ content: finalMsg });
    else await source.channel.send(finalMsg);
}

function generateQueueString(player) {
    if (!player) return 'Nic nie gra.';
    const prev = player.queue.previous || [];
    const historyList = prev.slice(-5).map((t, i) => `🔙 ${i + 1}. ~~${t.title}~~`).join('\n');
    const current = `💿 **${player.queue.current?.title || 'Nieznany'}**`;
    const nextList = player.queue.slice(0, 10).map((t, i) => `🔜 ${i + 1}. ${t.title}`).join('\n');

    let finalString = '';
    if (historyList) finalString += `**Już leciało:**\n${historyList}\n\n`;
    finalString += `**Teraz gra:**\n${current}\n\n`;
    if (nextList) finalString += `**Następne w kolejce:**\n${nextList}`;
    else finalString += `**Następne w kolejce:**\n(Koniec kolejki)`;
    
    if (player.queue.length > 10) finalString += `\n\n...i ${player.queue.length - 10} więcej.`;
    return finalString;
}

// ==========================================
// START BOTA I REJESTRACJA KOMEND
// ==========================================

client.once(Events.ClientReady, async () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('pw').setDescription('Masowa wiadomość DM').addRoleOption(o => o.setName('ranga').setDescription('Ranga').setRequired(true)).addStringOption(o => o.setName('wiadomosc').setDescription('Treść').setRequired(true)),
        new SlashCommandBuilder().setName('fembed').setDescription('Kreator Embedów').addChannelOption(o => o.setName('kanal').setDescription('Gdzie wysłać?')),
        new SlashCommandBuilder().setName('play').setDescription('Odtwarza muzykę').addStringOption(o => o.setName('utwor').setDescription('Link lub Tytuł').setRequired(true)),
        new SlashCommandBuilder().setName('stop').setDescription('Zatrzymuje muzykę'),
        new SlashCommandBuilder().setName('skip').setDescription('Pomija utwór'),
        new SlashCommandBuilder().setName('queue').setDescription('Pokazuje kolejkę'),
        new SlashCommandBuilder().setName('pętla').setDescription('Ustawia tryb pętli').addStringOption(o => o.setName('tryb').setDescription('Tryb').setRequired(true).addChoices({ name: '❌ Wyłącz', value: 'off' }, { name: '🔂 Utwór', value: 'track' }, { name: '🔁 Kolejka', value: 'queue' }, { name: '🔀 Losowa', value: 'random' })),
        new SlashCommandBuilder().setName('volume').setDescription('Ustawia głośność (0-200%)').addIntegerOption(o => o.setName('poziom').setDescription('%').setRequired(true).setMinValue(0).setMaxValue(200)),
    ];

    const guild = client.guilds.cache.get(GUILD_ID);
    try {
        if (guild) {
            await guild.commands.set(commands);
            console.log(`✅ Komendy zarejestrowane dla serwera: ${guild.name}`);
        } else {
            await client.application.commands.set(commands);
            console.log('⚠️ Rejestracja globalna (może potrwać do 1h).');
        }
    } catch (e) { console.error('Błąd rejestracji:', e); }
});

// ==========================================
// INTERAKCJE (PRZYCISKI, SLASH, MODAL)
// ==========================================
client.on(Events.InteractionCreate, async interaction => {
    
    // PRZYCISKI
    if (interaction.isButton()) {
        const player = kazagumo.players.get(interaction.guildId);

        if (interaction.customId === 'openEmbedModal') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            return await interaction.showModal(createEmbedModal(interaction.channelId));
        }

        if (['music_pause', 'music_skip', 'music_stop', 'music_queue', 'music_247'].includes(interaction.customId)) {
            
            if (interaction.customId === 'music_247') {
                if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale!', flags: MessageFlags.Ephemeral });
                const currentState = twentyFourSeven.get(interaction.guildId) || false;
                twentyFourSeven.set(interaction.guildId, !currentState);
                return interaction.reply({ content: `🔄 Tryb 24/7: **${!currentState ? 'ON' : 'OFF'}**.`, flags: MessageFlags.Ephemeral });
            }

            if (!player) return interaction.reply({ content: '⛔ Nic nie gra.', flags: MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale!', flags: MessageFlags.Ephemeral });

            if (interaction.customId === 'music_pause') {
                player.setPaused(!player.paused);
                return interaction.reply({ content: player.paused ? '⏸️' : '▶️', flags: MessageFlags.Ephemeral });
            }
            if (interaction.customId === 'music_skip') {
                player.skip();
                return interaction.reply({ content: '⏭️', flags: MessageFlags.Ephemeral });
            }
            if (interaction.customId === 'music_stop') {
                player.destroy();
                // Sprzątanie po STOP
                if (lastPanelMessage.has(interaction.guildId)) {
                    const id = lastPanelMessage.get(interaction.guildId);
                    interaction.channel.messages.fetch(id).then(m => m.delete()).catch(() => {});
                    lastPanelMessage.delete(interaction.guildId);
                }
                return interaction.reply({ content: '⏹️' });
            }
            if (interaction.customId === 'music_queue') {
                 return interaction.reply({ content: generateQueueString(player), flags: MessageFlags.Ephemeral });
            }
        }
    }

    // KOMENDY SLASH
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'play') {
            const { channel } = interaction.member.voice;
            if (!channel) return interaction.reply({ content: '❌ Wejdź na kanał!', flags: MessageFlags.Ephemeral });

            const query = interaction.options.getString('utwor');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                if (emptyTimers.has(interaction.guildId)) {
                    clearTimeout(emptyTimers.get(interaction.guildId));
                    emptyTimers.delete(interaction.guildId);
                }

                // Zombie check
                let player = kazagumo.players.get(interaction.guildId);
                const botVoice = interaction.guild.members.me.voice.channelId;
                if (player && !botVoice) { player.destroy(); player = null; }

                player = await kazagumo.createPlayer({
                    guildId: interaction.guildId,
                    textId: interaction.channelId,
                    voiceId: channel.id,
                    volume: 100,
                    savePreviousSongs: true 
                });

                const result = await kazagumo.search(query, { requester: interaction.user });
                if (!result.tracks.length) return interaction.editReply("❌ Nie znaleziono.");

                if (result.type === "PLAYLIST") {
                    for (let track of result.tracks) player.queue.add(track);
                    await interaction.editReply(`✅ Dodano playlistę: **${result.playlistName}**`);
                } else {
                    player.queue.add(result.tracks[0]);
                    await interaction.editReply(`✅ Dodano: **${result.tracks[0].title}**`);
                }

                if (!player.playing && !player.paused) player.play();

            } catch (e) {
                console.error(e);
                await interaction.editReply({ content: `❌ Błąd połączenia.` });
            }
        }

        if (interaction.commandName === 'stop') {
            const player = kazagumo.players.get(interaction.guildId);
            if (player) player.destroy();
            interaction.reply('⏹️');
        }
        if (interaction.commandName === 'skip') {
            const player = kazagumo.players.get(interaction.guildId);
            if (player) player.skip();
            interaction.reply('⏭️');
        }
        if (interaction.commandName === 'queue') {
            const player = kazagumo.players.get(interaction.guildId);
            interaction.reply({ content: generateQueueString(player), flags: MessageFlags.Ephemeral });
        }
        if (interaction.commandName === 'volume') {
            const player = kazagumo.players.get(interaction.guildId);
            if (player) player.setVolume(interaction.options.getInteger('poziom'));
            interaction.reply({ content: `🔊 ${interaction.options.getInteger('poziom')}%`, flags: MessageFlags.Ephemeral });
        }
        if (interaction.commandName === 'pętla') {
            const player = kazagumo.players.get(interaction.guildId);
            if (player) {
                const mode = interaction.options.getString('tryb');
                if (mode === 'random') { player.setLoop('queue'); player.queue.shuffle(); }
                else player.setLoop(mode === 'off' ? 'none' : mode);
                interaction.reply({ content: `Tryb pętli: ${mode}`, flags: MessageFlags.Ephemeral });
            } else interaction.reply({ content: '⛔ Nic nie gra.', flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'fembed') {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            await interaction.showModal(createEmbedModal(interaction.channelId));
        }
        if (interaction.commandName === 'pw') {
            const role = interaction.options.getRole('ranga');
            const msg = interaction.options.getString('wiadomosc');
            await handleMassDm(interaction, role, msg);
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
            const ch = await client.channels.fetch(targetChannelId);
            await ch.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ Wysłano.`, flags: MessageFlags.Ephemeral });
        } catch (err) { await interaction.reply({ content: '❌ Błąd.', flags: MessageFlags.Ephemeral }); }
    }
});

// ==========================================
// KOMENDY TEKSTOWE (PRZYWRÓCONE!)
// ==========================================
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // !play (Tekstowe)
    if (message.content.startsWith('!play')) {
        const { channel } = message.member.voice;
        if (!channel) return message.reply('❌ Musisz być na kanale głosowym!');
        const query = message.content.split(' ').slice(1).join(' ');
        if (!query) return message.reply('❌ Podaj tytuł.');
        
        try {
            if (emptyTimers.has(message.guildId)) {
                clearTimeout(emptyTimers.get(message.guildId));
                emptyTimers.delete(message.guildId);
            }

            // Zombie Check dla wersji tekstowej
            let player = kazagumo.players.get(message.guildId);
            const botVoice = message.guild.members.me.voice.channelId;
            if (player && !botVoice) { player.destroy(); player = null; }

            player = await kazagumo.createPlayer({
                guildId: message.guildId,
                textId: message.channelId,
                voiceId: channel.id,
                volume: 100,
                savePreviousSongs: true
            });
            const result = await kazagumo.search(query, { requester: message.author });
            if (!result.tracks.length) return message.reply("❌ Nie znaleziono.");
            
            player.queue.add(result.tracks[0]);
            if (!player.playing && !player.paused) player.play();
            message.react('🎵');
        } catch (e) { console.error(e); }
    }

    // !fembed (Tekstowe)
    if (message.content === '!fembed') {
        if (!checkPermissions(message.member)) return message.reply('⛔ Brak uprawnień.');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('openEmbedModal').setLabel('Stwórz').setStyle(ButtonStyle.Primary));
        await message.reply({ content: 'Kreator:', components: [row] });
    }

    // !pw (Tekstowe)
    if (message.content.startsWith('!pw')) {
        const args = message.content.split(' ');
        if (args.length < 3) return message.reply('Użycie: `!pw @Ranga Wiadomość`');
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) return message.reply('Brak rangi.');
        await handleMassDm(message, role, args.slice(2).join(' '));
    }
});

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");