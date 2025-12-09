const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa!'));
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
const { DisTube } = require('distube');

// --- IMPORTY PLUGINÓW ---
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { SpotifyPlugin } = require('@distube/spotify');
const ffmpegPath = require('ffmpeg-static');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// ==========================================
// KONFIGURACJA
// ==========================================

const GUILD_ID = 'WKLEJ_TUTAJ_ID_SWOJEGO_SERWERA'; 
const ROLE_PW_ID = '1447757045947174972';
const ROLE_EMBED_ID = '1447764029882896487';

// ==========================================
// KONFIGURACJA DISTUBE (POPRAWIONA)
// ==========================================
const distube = new DisTube(client, {
    emitNewSongOnly: true,
    ffmpeg: {
        path: ffmpegPath, 
    },
    plugins: [
        // POPRAWKA: Pusty konstruktor dla Spotify (stara opcja powodowała błąd)
        new SpotifyPlugin(), 
        new SoundCloudPlugin(),
        new YtDlpPlugin({ update: true }) 
    ]
});

// ==========================================
// EVENTY MUZYCZNE
// ==========================================
distube
    .on('playSong', (queue, song) => {
        let sourceIcon = '🎵';
        if (song.source === 'youtube') sourceIcon = 'YouTube ▶️';
        if (song.source === 'soundcloud') sourceIcon = 'SoundCloud ☁️';
        if (song.source === 'spotify') sourceIcon = 'Spotify 💚';

        const embed = new EmbedBuilder()
            .setTitle(`${sourceIcon} Gramy:`)
            .setDescription(`[${song.name}](${song.url})`)
            .addFields(
                { name: 'Czas', value: song.formattedDuration, inline: true },
                { name: 'Dodał', value: song.user.toString(), inline: true },
                { name: 'Źródło', value: song.source || 'Inne', inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setColor('Green');
        queue.textChannel.send({ embeds: [embed] });
    })
    .on('addSong', (queue, song) => queue.textChannel.send(`✅ Dodano: **${song.name}** - \`${song.formattedDuration}\``))
    .on('addList', (queue, playlist) => queue.textChannel.send(`✅ Dodano playlistę: **${playlist.name}** (${playlist.songs.length} utworów)`))
    .on('error', (channel, e) => {
        console.error('BŁĄD DISTUBE:', e);
        
        let errorMsg = e.message.slice(0, 100);
        if (e.message.includes("Sign in")) errorMsg = "Blokada YouTube. Bot automatycznie spróbuje SoundCloud przy następnym wyszukiwaniu.";
        if (e.message.includes("No result")) errorMsg = "Nie znaleziono utworu na SoundCloud/Spotify.";

        if (channel) channel.send(`❌ Błąd: ${errorMsg}`);
    });

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
        new SlashCommandBuilder().setName('play').setDescription('Odtwarza muzykę').addStringOption(o => o.setName('utwor').setDescription('Link (Spotify/SC) lub Tytuł').setRequired(true)),
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

    // --- /play (SMART MODE) ---
    if (interaction.commandName === 'play') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

        let query = interaction.options.getString('utwor');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply({ content: `🔍 Analizuję źródło: **${query}**...` });

        // LOGIKA SMART:
        // Render ma zablokowany YouTube.
        // Jeśli to NIE jest link, wymuszamy szukanie na SoundCloud ("scsearch:").
        if (!query.startsWith('http')) {
            console.log(`Wykryto tekst. Przełączam na SoundCloud: scsearch:${query}`); // Log dla pewności
            query = 'scsearch:' + query; 
        }

        try {
            await distube.play(voiceChannel, query, {
                member: interaction.member,
                textChannel: interaction.channel,
            });
        } catch (e) {
            console.error('Błąd play:', e);
            await interaction.editReply({ content: `❌ Błąd odtwarzania: ${e.message.slice(0, 100)}` });
        }
    }

    if (interaction.commandName === 'stop') {
        const queue = distube.getQueue(interaction.guildId);
        if (!queue) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
        queue.stop();
        await interaction.reply('⏹️ Zatrzymano.');
    }

    if (interaction.commandName === 'skip') {
        const queue = distube.getQueue(interaction.guildId);
        if (!queue) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
        try { await queue.skip(); await interaction.reply('⏭️ Pominięto.'); } 
        catch { await interaction.reply({ content: '⚠️ To ostatni utwór.', flags: MessageFlags.Ephemeral }); }
    }

    if (interaction.commandName === 'queue') {
        const queue = distube.getQueue(interaction.guildId);
        if (!queue) return interaction.reply({ content: 'Pusto.', flags: MessageFlags.Ephemeral });
        const q = queue.songs.slice(0, 10).map((s, i) => `${i === 0 ? 'Gra:' : i + '.'} ${s.name} (${s.source})`).join('\n');
        await interaction.reply({ content: `**Kolejka:**\n${q}`, flags: MessageFlags.Ephemeral });
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

// ==========================================
// KOMENDY TEKSTOWE
// ==========================================
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!play')) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ Wejdź na kanał głosowy!');
        let query = message.content.split(' ').slice(1).join(' ');
        if (!query) return message.reply('❌ Podaj tytuł.');
        
        // SMART LOGIC:
        if (!query.startsWith('http')) {
            query = 'scsearch:' + query;
        }

        try { await distube.play(voiceChannel, query, { member: message.member, textChannel: message.channel, message: message }); message.react('🎵'); } 
        catch (e) { console.error(e); }
    }
    if (message.content === '!stop') { distube.getQueue(message)?.stop(); message.reply('⏹️'); }
    if (message.content === '!skip') { try { await distube.getQueue(message)?.skip(); message.reply('⏭️'); } catch {} }

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