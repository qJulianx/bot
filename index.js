const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa!'));
app.listen(port, () => console.log(`Nasłuchiwanie na porcie ${port}`));

require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, REST, Routes } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// ID roli uprawnionej do komendy
const ALLOWED_ROLE_ID = '1447757045947174972';

// Funkcja opóźniająca (sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- UNIWERSALNA FUNKCJA WYSYŁAJĄCA ---
// Dzięki temu nie musimy pisać tego samego kodu dwa razy (dla !pw i /pw)
async function handleMassDm(source, role, contentToSend) {
    // source to albo message (dla !pw) albo interaction (dla /pw)
    
    // 1. Sprawdzanie uprawnień
    const member = source.member;
    if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
        const errorMsg = '⛔ Nie masz uprawnień do używania tej komendy.';
        if (source.reply) return source.reply({ content: errorMsg, ephemeral: true });
        return;
    }

    // Dla Slash Command musimy użyć deferReply, bo operacja może trwać długo
    // Dla Message po prostu wysyłamy info
    if (source.isCommand && source.isCommand()) {
        await source.deferReply(); 
    }

    // 2. Pobranie członków
    const guild = source.guild;
    await guild.members.fetch(); // Odśwież cache
    const membersWithRole = role.members.filter(m => !m.user.bot);
    const recipientsCount = membersWithRole.size;

    if (recipientsCount === 0) {
        const msg = 'Nikt nie posiada tej rangi.';
        if (source.isCommand && source.isCommand()) return source.editReply(msg);
        return source.reply(msg);
    }

    // 3. Logika Sleep
    const SAFE_MODE_LIMIT = 40;
    const useSleep = recipientsCount > SAFE_MODE_LIMIT;

    let infoMessage = `Rozpoczynam wysyłanie do **${recipientsCount}** osób z rangą **${role.name}**...`;
    if (useSleep) {
        infoMessage += `\n⚠️ **Limit 40+ osób:** Włączam bezpieczny tryb (2s przerwy).`;
    }

    // Informacja startowa
    if (source.isCommand && source.isCommand()) {
        await source.editReply(infoMessage);
    } else {
        await source.reply(infoMessage);
    }

    let sentCount = 0;
    let errorCount = 0;

    // 4. Pętla wysyłająca
    for (const [memberId, targetMember] of membersWithRole) {
        try {
            await targetMember.send(`**Wiadomość od administracji:**\n${contentToSend}`);
            sentCount++;
            
            if (useSleep) await sleep(2000); 

        } catch (error) {
            errorCount++;
            console.log(`Błąd (zablokowane PW) u: ${targetMember.user.tag}`);
        }
    }

    const finalMsg = `✅ Zakończono!\nWysłano: ${sentCount}\nZablokowane PW: ${errorCount}`;

    // Informacja końcowa
    if (source.isCommand && source.isCommand()) {
        await source.followUp(finalMsg);
    } else {
        await source.channel.send(finalMsg);
    }
}

client.once('ready', async () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

    // --- REJESTRACJA SLASH COMMAND ---
    // Definiujemy komendę /pw
    const pwCommand = new SlashCommandBuilder()
        .setName('pw')
        .setDescription('Wysyła wiadomość DM do wszystkich osób z daną rangą')
        .addRoleOption(option => 
            option.setName('ranga')
                .setDescription('Wybierz rangę odbiorców')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('wiadomosc')
                .setDescription('Treść wiadomości')
                .setRequired(true));

    // Rejestrujemy komendę globalnie (lub na serwerze - tutaj globalnie dla uproszczenia)
    // Uwaga: Aktualizacja globalnych komend może potrwać do godziny. 
    // Aby zadziałało natychmiast, używamy application.commands.set
    try {
        await client.application.commands.set([pwCommand]);
        console.log('Zarejestrowano komendę /pw');
    } catch (error) {
        console.error('Błąd rejestracji komend:', error);
    }
});

// --- OBSŁUGA SLASH COMMAND (/pw) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'pw') {
        const role = interaction.options.getRole('ranga');
        const messageContent = interaction.options.getString('wiadomosc');

        // Wywołujemy wspólną funkcję
        await handleMassDm(interaction, role, messageContent);
    }
});

// --- OBSŁUGA STANDARDOWEJ KOMENDY (!pw) ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!pw')) {
        const args = message.content.split(' ');
        if (args.length < 3) {
            // Sprawdzamy rolę tylko po to, by nie spamować błędem osobom bez uprawnień
            if (message.member.roles.cache.has(ALLOWED_ROLE_ID)) {
                return message.reply('Poprawne użycie: `!pw @Ranga Twoja wiadomość`');
            }
            return; 
        }

        let role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) return message.reply('Nie znaleziono takiej rangi.');

        const contentToSend = args.slice(2).join(' ');

        // Wywołujemy wspólną funkcję
        await handleMassDm(message, role, contentToSend);
    }

    // Inne komendy
    if (message.content === '!ping') {
        message.reply('Pong!');
    }
});

const token = process.env.TOKEN;
if (token) {
    client.login(token);
} else {
    console.error("Brak tokenu bota w pliku .env!");
}