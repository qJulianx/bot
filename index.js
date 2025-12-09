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
    ButtonStyle 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// --- KONFIGURACJA ---
// ID Roli dla komendy !pw / /pw
const ROLE_PW_ID = '1447757045947174972';
// ID Roli dla komendy !fembed / /fembed
const ROLE_EMBED_ID = '1447764029882896487';

// Funkcja opóźniająca (dla PW)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- FUNKCJA TWORZĄCA MODAL (Formularz) ---
function createEmbedModal(targetChannelId) {
    // Przekazujemy ID kanału w ID modala, żeby wiedzieć gdzie wysłać wynik
    const modal = new ModalBuilder()
        .setCustomId(`embedModal:${targetChannelId}`)
        .setTitle('Kreator Embedów');

    const titleInput = new TextInputBuilder()
        .setCustomId('embedTitle')
        .setLabel("Tytuł Embeda")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const descInput = new TextInputBuilder()
        .setCustomId('embedDesc')
        .setLabel("Opis")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const colorInput = new TextInputBuilder()
        .setCustomId('embedColor')
        .setLabel("Kolor (np. Red, Blue, #ff0000)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Blue')
        .setRequired(false);

    const imageInput = new TextInputBuilder()
        .setCustomId('embedImage')
        .setLabel("Link do obrazka (URL)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const footerInput = new TextInputBuilder()
        .setCustomId('embedFooter')
        .setLabel("Stopka (Footer)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(footerInput)
    );

    return modal;
}

client.once('ready', async () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

    // --- REJESTRACJA KOMEND ---
    const commands = [
        // Komenda /pw
        new SlashCommandBuilder()
            .setName('pw')
            .setDescription('Wysyła wiadomość DM do rangi')
            .addRoleOption(o => o.setName('ranga').setDescription('Ranga').setRequired(true))
            .addStringOption(o => o.setName('wiadomosc').setDescription('Treść').setRequired(true)),
        
        // Komenda /fembed
        new SlashCommandBuilder()
            .setName('fembed')
            .setDescription('Otwiera kreator Embedów')
            .addChannelOption(o => o.setName('kanal').setDescription('Gdzie wysłać embed? (Domyślnie tutaj)'))
    ];

    // WAŻNE: Wpisz tutaj ID swojego serwera dla natychmiastowego efektu
    const GUILD_ID = 'TUTAJ_WKLEJ_ID_TWOJEGO_SERWERA'; 
    const guild = client.guilds.cache.get(GUILD_ID);

    try {
        if (guild) {
            await guild.commands.set(commands);
            console.log(`✅ Zarejestrowano komendy (/pw i /fembed) dla serwera: ${guild.name}`);
        } else {
            await client.application.commands.set(commands);
            console.log('Zarejestrowano komendy globalnie.');
        }
    } catch (error) {
        console.error('Błąd rejestracji:', error);
    }
});

// --- GŁÓWNA OBSŁUGA INTERAKCJI (Slash, Button, Modal) ---
client.on('interactionCreate', async interaction => {
    
    // 1. OBSŁUGA SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        
        // --- /fembed ---
        if (interaction.commandName === 'fembed') {
            if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) {
                return interaction.reply({ content: '⛔ Nie masz uprawnień do tworzenia embedów.', ephemeral: true });
            }

            // Sprawdzamy, czy użytkownik wybrał kanał, czy wysyłamy na obecny
            const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
            
            // Pokazujemy formularz
            await interaction.showModal(createEmbedModal(targetChannel.id));
        }

        // --- /pw ---
        if (interaction.commandName === 'pw') {
            // Tutaj wklej logikę z poprzedniego kodu handleMassDm...
            // Dla czytelności tego przykładu skróciłem to, ale Twój kod PW powinien tu zostać.
            await interaction.reply({ content: 'Funkcja PW jest aktywna (skrót w kodzie).', ephemeral: true });
        }
    }

    // 2. OBSŁUGA PRZYCISKU (dla !fembed)
    if (interaction.isButton()) {
        if (interaction.customId === 'openEmbedModal') {
            if (!interaction.member.roles.cache.has(ROLE_EMBED_ID)) {
                return interaction.reply({ content: '⛔ Brak uprawnień.', ephemeral: true });
            }
            // Otwieramy ten sam modal co w /fembed (wysyłka na ten sam kanał)
            await interaction.showModal(createEmbedModal(interaction.channelId));
        }
    }

    // 3. OBSŁUGA WYSŁANIA FORMULARZA (MODAL SUBMIT)
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('embedModal')) {
            // Wyciągamy ID kanału z customId (zapisaliśmy je tam wcześniej jako embedModal:ID_KANAŁU)
            const targetChannelId = interaction.customId.split(':')[1];
            
            const title = interaction.fields.getTextInputValue('embedTitle');
            const desc = interaction.fields.getTextInputValue('embedDesc');
            let color = interaction.fields.getTextInputValue('embedColor');
            const image = interaction.fields.getTextInputValue('embedImage');
            const footer = interaction.fields.getTextInputValue('embedFooter');

            // Walidacja koloru (domyślny Blue jeśli pusty lub błędny)
            if (!color) color = 'Blue';

            const embed = new EmbedBuilder()
                .setDescription(desc)
                .setColor(color); // Discord.js spróbuje dopasować kolor (nazwa angielska lub HEX)

            if (title) embed.setTitle(title);
            if (image) embed.setImage(image);
            if (footer) embed.setFooter({ text: footer });

            try {
                const channel = await client.channels.fetch(targetChannelId);
                await channel.send({ embeds: [embed] });
                
                await interaction.reply({ content: `✅ Wysłano embed na kanał ${channel}.`, ephemeral: true });
            } catch (err) {
                console.error(err);
                await interaction.reply({ content: '❌ Wystąpił błąd podczas wysyłania (sprawdź ID kanału, kolor lub URL obrazka).', ephemeral: true });
            }
        }
    }
});

// --- OBSŁUGA KOMEND TEKSTOWYCH (!pw, !fembed) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // --- !fembed ---
    if (message.content === '!fembed') {
        if (!message.member.roles.cache.has(ROLE_EMBED_ID)) {
            return message.reply('⛔ Nie masz uprawnień.');
        }

        // Ponieważ !fembed nie może otworzyć formularza bezpośrednio, wysyłamy przycisk
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('openEmbedModal')
                    .setLabel('🎨 Stwórz Embed')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.reply({ 
            content: 'Kliknij poniżej, aby otworzyć kreator embedów:', 
            components: [row] 
        });
    }

    // --- !pw ---
    if (message.content.startsWith('!pw')) {
       // Tutaj Twoja stara logika PW...
       // Pamiętaj o sprawdzeniu roli ROLE_PW_ID
    }
});

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");