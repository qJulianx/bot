const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa z Lavalink (Smart Panel)!'));
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
const lastPanelMessage = new Map(); // ID ostatniego panelu

// ==========================================
// KONFIGURACJA LAVALINK
// ==========================================
const NODES = [
    {
        name: 'AjieDev-V4', 
        url: 'lava-v4.ajieblogs.eu.org:443', 
        auth: 'https://dsc.gg/ajidevserver', 
        secure: true 
    }
];

// ==========================================
// TWOJA KONFIGURACJA (ID)
// ==========================================
const GUILD_ID = 'WKLEJ_TUTAJ_ID_SWOJEGO_SERWERA'; 
const ROLE_PW_ID = '1447757045947174972';
const ROLE_EMBED_ID = '1447764029882896487';

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
}, new Connectors.DiscordJS(client), NODES);

// ==========================================
// EVENTY MUZYCZNE (SMART PANEL)
// ==========================================
kazagumo.on("playerStart", async (player, track) => {
    // 1. Czyścimy timer wyjścia
    if (emptyTimers.has(player.guildId)) {
        clearTimeout(emptyTimers.get(player.guildId));
        emptyTimers.delete(player.guildId);
    }

    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    // 2. Przygotowujemy dane (Embed + Przyciski)
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

    const is247 = twentyFourSeven.get(player.guildId) || false;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setLabel('Pauza').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setLabel('Skip').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('music_247').setEmoji('🔁').setLabel(is247 ? '24/7: ON' : '24/7: OFF').setStyle(is247 ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_queue').setEmoji('📜').setLabel('Lista').setStyle(ButtonStyle.Secondary)
    );

    // 3. INTELIGENTNA OBSŁUGA WIADOMOŚCI
    let messageUpdated = false;
    const lastMsgId = lastPanelMessage.get(player.guildId);

    if (lastMsgId) {
        // Sprawdzamy, czy ostatnia wiadomość na kanale to nasz panel
        const lastChannelMsgId = channel.lastMessageId;

        if (lastChannelMsgId === lastMsgId) {
            // SCENARIUSZ A: Nikt nie pisał -> Edytujemy istniejącą wiadomość
            try {
                const existingMsg = await channel.messages.fetch(lastMsgId);
                if (existingMsg) {
                    await existingMsg.edit({ embeds: [embed], components: [row] });
                    messageUpdated = true;
                }
            } catch (e) { 
                // Jeśli nie udało się edytować (np. ktoś usunął), wyślemy nową
                messageUpdated = false; 
            }
        } else {
            // SCENARIUSZ B: Ktoś napisał -> Usuwamy starą (żeby nie było duplikatu)
            try {
                const oldMsg = await channel.messages.fetch(lastMsgId).catch(() => null);
                if (oldMsg) await oldMsg.delete();
            } catch (e) {}
        }
    }

    // Jeśli nie udało się zaktualizować (bo ktoś pisał albo to pierwszy utwór), wysyłamy nową
    if (!messageUpdated) {
        const msg = await channel.send({ embeds: [embed], components: [row] });
        lastPanelMessage.set(player.guildId, msg.id);
    }
});

kazagumo.on("playerEnd", (player) => {
    // Nic nie robimy
});

kazagumo.on("playerEmpty", async (player) => {
    const channel = client.channels.cache.get(player.textId);
    
    // Usuwamy panel gdy kolejka się kończy (czystość na czacie)
    if (lastPanelMessage.has(player.guildId)) {
        const lastMsgId = lastPanelMessage.get(player.guildId);
        try {
            const oldMsg = await channel.messages.fetch(lastMsgId).catch(() => null);
            if (oldMsg) await oldMsg.delete();
        } catch (e) {}
        lastPanelMessage.delete(player.guildId);
    }

    if (twentyFourSeven.get(player.guildId)) {
        if (channel) channel.send("zzz... Kolejka pusta, ale czekam (Tryb 24/7).");
        return; 
    }

    if (channel) channel.send("⏳ Kolejka pusta. Wyjdę za **1 minutę**, jeśli nic nie puścisz.");

    const timer = setTimeout(() => {
        if (!player.queue.length && !player.playing) {
            player.destroy();
            if (channel) channel.send("⏹️ Brak aktywności. Wychodzę z kanału.");
            emptyTimers.delete(player.guildId);
        }
    }, 60 * 1000); 

    emptyTimers.set(player.guildId, timer);
});

// Logowanie stanu Lavalink
kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink Node ${name} jest gotowy!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink Node ${name} błąd:`, error));

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
    if (!member.roles.cache.has(ROLE_PW_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
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
// START BOTA
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
// OBSŁUGA INTERAKCJI (SLASH + BUTTONS + MODALS)
// ==========================================
client.on(Events.InteractionCreate, async interaction => {
    
    if (interaction.isButton()) {
        const player = kazagumo.players.get(interaction.guildId);

        if (interaction.customId === 'openEmbedModal') {
            if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            return await interaction.showModal(createEmbedModal(interaction.channelId));
        }

        if (['music_pause', 'music_skip', 'music_stop', 'music_queue', 'music_247'].includes(interaction.customId)) {
            
            if (interaction.customId === 'music_247') {
                if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });
                const currentState = twentyFourSeven.get(interaction.guildId) || false;
                twentyFourSeven.set(interaction.guildId, !currentState);
                return interaction.reply({ content: `🔄 Tryb 24/7 został **${!currentState ? 'WŁĄCZONY ✅' : 'WYŁĄCZONY ❌'}**.`, flags: MessageFlags.Ephemeral });
            }

            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

            if (interaction.customId === 'music_pause') {
                const isPaused = !player.paused;
                player.setPaused(isPaused);
                return interaction.reply({ content: isPaused ? '⏸️ Zauzowano.' : '▶️ Wznowiono.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId === 'music_skip') {
                player.skip();
                return interaction.reply({ content: '⏭️ Pomijanie...', flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId === 'music_stop') {
                player.destroy();
                // Usuwamy panel po stopie
                if (lastPanelMessage.has(interaction.guildId)) {
                    const lastMsgId = lastPanelMessage.get(interaction.guildId);
                    try {
                        const oldMsg = await interaction.channel.messages.fetch(lastMsgId).catch(() => null);
                        if (oldMsg) await oldMsg.delete();
                    } catch (e) {}
                    lastPanelMessage.delete(interaction.guildId);
                }
                return interaction.reply({ content: '⏹️ Zatrzymano i wyczyszczono.' });
            }

            if (interaction.customId === 'music_queue') {
                 if (player.queue.length === 0) return interaction.reply({ content: 'Kolejka jest pusta (leci tylko to co teraz).', flags: MessageFlags.Ephemeral });
                 const q = player.queue.map((track, i) => `${i + 1}. ${track.title}`).slice(0, 10).join('\n');
                 return interaction.reply({ content: `**Następne w kolejce:**\n${q}`, flags: MessageFlags.Ephemeral });
            }
        }
    }

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'play') {
            const { channel } = interaction.member.voice;
            if (!channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

            const query = interaction.options.getString('utwor');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                if (emptyTimers.has(interaction.guildId)) {
                    clearTimeout(emptyTimers.get(interaction.guildId));
                    emptyTimers.delete(interaction.guildId);
                }

                const player = await kazagumo.createPlayer({
                    guildId: interaction.guildId,
                    textId: interaction.channelId,
                    voiceId: channel.id,
                    volume: 100
                });

                const result = await kazagumo.search(query, { requester: interaction.user });
                if (!result.tracks.length) return interaction.editReply("❌ Nie znaleziono utworu.");

                if (result.type === "PLAYLIST") {
                    for (let track of result.tracks) player.queue.add(track);
                    await interaction.editReply(`✅ Dodano playlistę: **${result.playlistName}** (${result.tracks.length} utworów)`);
                } else {
                    player.queue.add(result.tracks[0]);
                    await interaction.editReply(`✅ Dodano do kolejki: **${result.tracks[0].title}**`);
                }

                if (!player.playing && !player.paused) player.play();

            } catch (e) {
                console.error('Błąd Lavalink:', e);
                await interaction.editReply({ content: `❌ Błąd połączenia z węzłem Lavalink.` });
            }
        }

        if (interaction.commandName === 'stop') {
            const player = kazagumo.players.get(interaction.guildId);
            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            player.destroy();
            await interaction.reply('⏹️ Zatrzymano i rozłączono.');
        }

        if (interaction.commandName === 'skip') {
            const player = kazagumo.players.get(interaction.guildId);
            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            player.skip();
            await interaction.reply('⏭️ Pominięto.');
        }

        if (interaction.commandName === 'queue') {
            const player = kazagumo.players.get(interaction.guildId);
            if (!player || player.queue.length === 0) return interaction.reply({ content: 'Pusto.', flags: MessageFlags.Ephemeral });
            const q = player.queue.map((track, i) => `${i + 1}. ${track.title}`).slice(0, 10).join('\n');
            await interaction.reply({ content: `**Kolejka (Lavalink):**\n${q}`, flags: MessageFlags.Ephemeral });
        }

        if (interaction.commandName === 'fembed') {
            if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
            const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
            await interaction.showModal(createEmbedModal(targetChannel.id));
        }

        if (interaction.commandName === 'pw') {
            const role = interaction.options.getRole('ranga');
            const messageContent = interaction.options.getString('wiadomosc');
            await handleMassDm(interaction, role, messageContent);
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
    }
});

// ==========================================
// KOMENDY TEKSTOWE
// ==========================================
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

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

            const player = await kazagumo.createPlayer({
                guildId: message.guildId,
                textId: message.channelId,
                voiceId: channel.id,
                volume: 100
            });
            const result = await kazagumo.search(query, { requester: message.author });
            if (!result.tracks.length) return message.reply("❌ Nie znaleziono.");
            
            player.queue.add(result.tracks[0]);
            if (!player.playing && !player.paused) player.play();
            message.react('🎵');
        } catch (e) { console.error(e); }
    }
    if (message.content === '!fembed') {
        if (!message.member.roles.cache.has(ROLE_EMBED_ID)) return message.reply('⛔ Brak uprawnień.');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('openEmbedModal').setLabel('Stwórz').setStyle(ButtonStyle.Primary));
        await message.reply({ content: 'Otwórz kreator:', components: [row] });
    }
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