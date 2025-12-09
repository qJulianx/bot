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
    PermissionsBitField 
} = require('discord.js');
const { DisTube } = require('distube'); // Biblioteka muzyczna

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates, // Wygane do muzyki
    ],
});

// ==========================================
// KONFIGURACJA (UZUPEŁNIJ TO!)
// ==========================================

// ID Twojego serwera (dla szybkiego ładowania komend /)
const GUILD_ID = 'WKLEJ_TUTAJ_ID_SWOJEGO_SERWERA'; 

// ID Roli, która może używać !pw
const ROLE_PW_ID = '1447757045947174972';

// ID Roli, która może używać !fembed
const ROLE_EMBED_ID = '1447764029882896487';

// ==========================================
// KONFIGURACJA DISTUBE (MUZYKA)
// ==========================================
const distube = new DisTube(client, {
    emitNewSongOnly: true,
    leaveOnFinish: true,
    leaveOnStop: true,
});

// Eventy DisTube (co bot pisze na czacie)
distube
    .on('playSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setTitle('🎶 Gramy:')
            .setDescription(`[${song.name}](${song.url})`)
            .addFields(
                { name: 'Czas', value: song.formattedDuration, inline: true },
                { name: 'Dodał', value: song.user.toString(), inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setColor('Green');
        queue.textChannel.send({ embeds: [embed] });
    })
    .on('addSong', (queue, song) => queue.textChannel.send(`✅ Dodano: **${song.name}** - \`${song.formattedDuration}\``))
    .on('addList', (queue, playlist) => queue.textChannel.send(`✅ Dodano playlistę: **${playlist.name}** (${playlist.songs.length} utworów)`))
    .on('error', (channel, e) => {
        if (channel) channel.send(`❌ Błąd muzyczny: ${e.toString().slice(0, 100)}`);
        else console.error(e);
    });

// ==========================================
// FUNKCJE POMOCNICZE (PW & EMBED)
// ==========================================

// Funkcja Sleep (anty-spam)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Funkcja tworząca formularz Embeda
function createEmbedModal(targetChannelId) {
    const modal = new ModalBuilder()
        .setCustomId(`embedModal:${targetChannelId}`)
        .setTitle('Kreator Embedów');

    const inputs = [
        new TextInputBuilder().setCustomId('embedTitle').setLabel("Tytuł").setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('embedDesc').setLabel("Opis").setStyle(TextInputStyle.Paragraph).setRequired(true),
        new TextInputBuilder().setCustomId('embedColor').setLabel("Kolor (np. Red, #ff0000)").setStyle(TextInputStyle.Short).setPlaceholder('Blue').setRequired(false),
        new TextInputBuilder().setCustomId('embedImage').setLabel("Obrazek (URL)").setStyle(TextInputStyle.Short).setRequired(false),
        new TextInputBuilder().setCustomId('embedFooter').setLabel("Stopka").setStyle(TextInputStyle.Short).setRequired(false)
    ];

    inputs.forEach(input => modal.addComponents(new ActionRowBuilder().addComponents(input)));
    return modal;
}

// Funkcja obsługująca masowe PW (!pw i /pw)
async function handleMassDm(source, role, contentToSend) {
    const member = source.member;
    
    // Sprawdzenie uprawnień
    if (!member.roles.cache.has(ROLE_PW_ID) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const msg = '⛔ Nie masz uprawnień do tej komendy.';
        if (source.reply) return source.reply({ content: msg, ephemeral: true });
        return;
    }

    if (source.isCommand && source.isCommand()) await source.deferReply();

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
        } catch (error) {
            errorCount++;
        }
    }

    const finalMsg = `✅ Zakończono!\nWysłano: ${sentCount}\nZablokowane PW: ${errorCount}`;
    if (source.isCommand && source.isCommand()) await source.followUp(finalMsg);
    else await source.channel.send(finalMsg);
}

// ==========================================
// START BOTA
// ==========================================

client.once('ready', async () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

    // Rejestracja komend Slash
    const commands = [
        new SlashCommandBuilder()
            .setName('pw')
            .setDescription('Masowa wiadomość DM')
            .addRoleOption(o => o.setName('ranga').setDescription('Ranga').setRequired(true))
            .addStringOption(o => o.setName('wiadomosc').setDescription('Treść').setRequired(true)),
        
        new SlashCommandBuilder()
            .setName('fembed')
            .setDescription('Kreator Embedów')
            .addChannelOption(o => o.setName('kanal').setDescription('Gdzie wysłać?')),
    ];

    const guild = client.guilds.cache.get(GUILD_ID);
    try {
        if (guild) {
            await guild.commands.set(commands);
            console.log(`✅ Komendy zarejestrowane dla serwera: ${guild.name}`);
        } else {
            await client.application.commands.set(commands);
            console.log('⚠️ Nie znaleziono serwera po ID, zarejestrowano globalnie (może potrwać 1h).');
        }
    } catch (e) { console.error('Błąd rejestracji:', e); }
});

// ==========================================
// OBSŁUGA INTERAKCJI (Slash, Button, Modal)
// ==========================================
client.on('interactionCreate', async interaction => {
    
    // --- KOMENDY SLASH (/pw, /fembed) ---
    if (interaction.isChatInputCommand()) {
        
        if (interaction.commandName === 'fembed') {
            if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) {
                return interaction.reply({ content: '⛔ Brak uprawnień.', ephemeral: true });
            }
            const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
            await interaction.showModal(createEmbedModal(targetChannel.id));
        }

        if (interaction.commandName === 'pw') {
            const role = interaction.options.getRole('ranga');
            const messageContent = interaction.options.getString('wiadomosc');
            await handleMassDm(interaction, role, messageContent);
        }
    }

    // --- PRZYCISK (!fembed -> Otwórz) ---
    if (interaction.isButton() && interaction.customId === 'openEmbedModal') {
        if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) {
            return interaction.reply({ content: '⛔ Brak uprawnień.', ephemeral: true });
        }
        await interaction.showModal(createEmbedModal(interaction.channelId));
    }

    // --- FORMULARZ (Wysłanie Embeda) ---
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
            await interaction.reply({ content: `✅ Wysłano na ${channel}.`, ephemeral: true });
        } catch (err) {
            await interaction.reply({ content: '❌ Błąd wysyłania (sprawdź kolor/obrazek).', ephemeral: true });
        }
    }
});

// ==========================================
// OBSŁUGA WIADOMOŚCI (!pw, !fembed, !play)
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // --- !fembed ---
    if (message.content === '!fembed') {
        if (!message.member.roles.cache.has(ROLE_EMBED_ID)) return message.reply('⛔ Brak uprawnień.');
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('openEmbedModal').setLabel('🎨 Stwórz Embed').setStyle(ButtonStyle.Primary)
        );
        await message.reply({ content: 'Otwórz kreator:', components: [row] });
    }

    // --- !pw ---
    if (message.content.startsWith('!pw')) {
        const args = message.content.split(' ');
        if (args.length < 3) return message.reply('Użycie: `!pw @Ranga Wiadomość`');
        
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) return message.reply('Nie znaleziono rangi.');
        
        const content = args.slice(2).join(' ');
        await handleMassDm(message, role, content);
    }

    // --- MUZYKA (!play, !stop, !skip, !queue) ---
    if (message.content.startsWith('!play')) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('❌ Wejdź najpierw na kanał głosowy!');

        const query = message.content.split(' ').slice(1).join(' ');
        if (!query) return message.reply('❌ Podaj tytuł lub link.');

        try {
            await distube.play(voiceChannel, query, {
                member: message.member,
                textChannel: message.channel,
                message: message
            });
            message.react('🎵');
        } catch (e) { console.error(e); }
    }

    if (message.content === '!stop') {
        const queue = distube.getQueue(message);
        if (queue) { queue.stop(); message.reply('⏹️ Zatrzymano.'); }
        else message.reply('Nic nie gra.');
    }

    if (message.content === '!skip') {
        const queue = distube.getQueue(message);
        if (queue) {
            try { await queue.skip(); message.reply('⏭️ Pominięto.'); } 
            catch { message.reply('To ostatni utwór.'); }
        } else message.reply('Nic nie gra.');
    }

    if (message.content === '!queue') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('Kolejka pusta.');
        const q = queue.songs.slice(0, 10).map((s, i) => `${i === 0 ? 'Gra:' : i + '.'} ${s.name}`).join('\n');
        message.reply(`**Kolejka:**\n${q}`);
    }

    if (message.content === '!ping') message.reply('Pong!');
});

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");