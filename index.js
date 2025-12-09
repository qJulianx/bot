const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa!'));

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));

require('dotenv').config(); 
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Niezbędne do pobierania członków i ról
    ],
});

// Funkcja opóźniająca (sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.once('ready', () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // --- Komenda !pw ---
    if (message.content.startsWith('!pw')) {
        
        // ID roli, która ma dostęp do komendy
        const ALLOWED_ROLE_ID = '1447757045947174972';

        // 1. Zabezpieczenie: Sprawdź czy użytkownik ma rolę O LUB jest Adminem
        const hasRole = message.member.roles.cache.has(ALLOWED_ROLE_ID);
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (!hasRole && !isAdmin) {
            return message.reply('Nie masz uprawnień do używania tej komendy (wymagana specjalna ranga).');
        }

        const args = message.content.split(' ');

        if (args.length < 3) {
            return message.reply('Poprawne użycie: `!pw @Ranga Twoja wiadomość`');
        }

        // 2. Znalezienie rangi (wzmianka lub ID)
        let role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);

        if (!role) {
            return message.reply('Nie znaleziono takiej rangi.');
        }

        // 3. Wyciągnięcie treści wiadomości
        // Usuwamy dwa pierwsze elementy (!pw i rangę)
        const contentToSend = args.slice(2).join(' ');

        // 4. Pobranie członków
        await message.guild.members.fetch();
        const membersWithRole = role.members.filter(member => !member.user.bot);
        const recipientsCount = membersWithRole.size;

        if (recipientsCount === 0) {
            return message.reply('Nikt nie posiada tej rangi.');
        }

        // LOGIKA SLEEP: Sprawdzamy czy odbiorców jest więcej niż 40
        const SAFE_MODE_LIMIT = 40;
        const useSleep = recipientsCount > SAFE_MODE_LIMIT;

        let infoMessage = `Rozpoczynam wysyłanie do **${recipientsCount}** osób z rangą **${role.name}**...`;
        
        if (useSleep) {
            infoMessage += `\n⚠️ **UWAGA:** Wykryto dużą liczbę odbiorców (>40). Włączam tryb spowolniony (2s przerwy), aby uniknąć blokady bota. To chwilę potrwa.`;
        }

        message.reply(infoMessage);

        let sentCount = 0;
        let errorCount = 0;

        // 5. Pętla wysyłająca
        for (const [memberId, member] of membersWithRole) {
            try {
                await member.send(`**Wiadomość od administracji:**\n${contentToSend}`);
                sentCount++;
                
                // Jeśli włączony jest tryb sleep, czekamy 2000ms (2 sekundy) przed następną wiadomością
                if (useSleep) {
                    await sleep(2000); 
                }

            } catch (error) {
                errorCount++;
                console.log(`Błąd wysyłania do ${member.user.tag}: PW zablokowane.`);
            }
        }

        message.channel.send(`✅ Zakończono wysyłanie!\nSkutecznie: ${sentCount}\nZablokowane PW: ${errorCount}`);
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