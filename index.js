const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa z Lavalink (AjieDev)!'));
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
// KONFIGURACJA LAVALINK (DANE OD CIEBIE)
// ==========================================
const NODES = [
    {
        name: 'AjieDev-V4', 
        url: 'lava-v4.ajieblogs.eu.org:443', // Host + Port
        auth: 'https://dsc.gg/ajidevserver', // Hasło
        secure: true                         // True, bo port 443
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

// Tworzymy menedżera muzyki (Kazagumo)
const kazagumo = new Kazagumo({
    defaultSearchEngine: "youtube", // Ten Lavalink obsługuje YT, więc możemy tu zostawić youtube
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), NODES);

// ==========================================
// EVENTY MUZYCZNE (Kazagumo)
// ==========================================
kazagumo.on("playerStart", (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('🎶 Gramy:')
        .setDescription(`[${track.title}](${track.uri})`)
        .addFields(
            { name: 'Autor', value: track.author || 'Nieznany', inline: true },
            { name: 'Dodał', value: track.requester ? `<@${track.requester.id}>` : 'Ktoś', inline: true }
        )
        .setColor('Green');
    channel.send({ embeds: [embed] });
});

kazagumo.on("playerEnd", (player) => {
    // Utwór się skończył
});

kazagumo.on("playerEmpty", (player) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) channel.send("⏹️ Kolejka pusta. Wychodzę.");
    player.destroy();
});

// Logowanie stanu Lavalink
kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink Node ${name} jest gotowy i połączony!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink Node ${name} błąd:`, error));
kazagumo.shoukaku.on('close', (name, code, reason) => console.warn(`⚠️ Lavalink Node ${name} zamknięty: ${reason}`));

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
// OBSŁUGA SLASH COMMANDS
// ==========================================
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // --- /play (LAVALINK) ---
    if (interaction.commandName === 'play') {
        const { channel } = interaction.member.voice;
        if (!channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

        const query = interaction.options.getString('utwor');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 1. Tworzymy odtwarzacz
            const player = await kazagumo.createPlayer({
                guildId: interaction.guildId,
                textId: interaction.channelId,
                voiceId: channel.id,
                volume: 100
            });

            // 2. Szukamy utworu (ten Lavalink obsługuje YT, Spotify, Soundcloud sam w sobie)
            const result = await kazagumo.search(query, { requester: interaction.user });
            
            if (!result.tracks.length) {
                return interaction.editReply("❌ Nie znaleziono utworu. Spróbuj podać bezpośredni link.");
            }

            // 3. Dodajemy do kolejki
            if (result.type === "PLAYLIST") {
                for (let track of result.tracks) player.queue.add(track);
                await interaction.editReply(`✅ Dodano playlistę: **${result.playlistName}** (${result.tracks.length} utworów)`);
            } else {
                player.queue.add(result.tracks[0]);
                await interaction.editReply(`✅ Dodano do kolejki: **${result.tracks[0].title}**`);
            }

            // 4. Jeśli nic nie gra, startujemy
            if (!player.playing && !player.paused) player.play();

        } catch (e) {
            console.error('Błąd Lavalink:', e);
            await interaction.editReply({ content: `❌ Błąd połączenia z serwerem muzycznym. Spróbuj później.` });
        }
    }

    // --- /stop ---
    if (interaction.commandName === 'stop') {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
        player.destroy();
        await interaction.reply('⏹️ Zatrzymano i rozłączono.');
    }

    // --- /skip ---
    if (interaction.commandName === 'skip') {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
        player.skip();
        await interaction.reply('⏭️ Pominięto.');
    }

    // --- /queue ---
    if (interaction.commandName === 'queue') {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player || player.queue.length === 0) return interaction.reply({ content: 'Pusto.', flags: MessageFlags.Ephemeral });
        
        const q = player.queue.map((track, i) => `${i + 1}. ${track.title}`).slice(0, 10).join('\n');
        await interaction.reply({ content: `**Kolejka (Lavalink):**\n${q}`, flags: MessageFlags.Ephemeral });
    }

    // --- /fembed ---
    if (interaction.commandName === 'fembed') {
        if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
        await interaction.showModal(createEmbedModal(targetChannel.id));
    }

    // --- /pw ---
    if (interaction.commandName === 'pw') {
        const role = interaction.options.getRole('ranga');
        const messageContent = interaction.options.getString('wiadomosc');
        await handleMassDm(interaction, role, messageContent);
    }
});

// ==========================================
// OBSŁUGA BUTTON & MODAL
// ==========================================
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton() && interaction.customId === 'openEmbedModal') {
        if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });
        await interaction.showModal(createEmbedModal(interaction.channelId));
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

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");