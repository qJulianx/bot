const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa!'));

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`));

// Ładowanie zmiennych środowiskowych z pliku .env
require('dotenv').config(); 
const { Client, GatewayIntentBits } = require('discord.js');

// Tworzenie nowej instancji klienta (bota)
// Musimy określić Intents, aby bot mógł widzieć wiadomości i statusy
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Kluczowe, aby odczytać treść wiadomości
    ],
});

// Zdarzenie: Bot jest gotowy
client.once('ready', () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);
});

// Zdarzenie: Otrzymano nową wiadomość
client.on('messageCreate', message => {
    // Zapobieganie reakcji bota na własne wiadomości
    if (message.author.bot) return;

    // Prosta komenda 'ping'
    if (message.content === '!ping') {
        message.reply('Pong!');
    }
    
    // Prosta komenda powitalna
    if (message.content.toLowerCase() === 'cześć') {
        message.reply(`Witaj, ${message.author.username}! Jestem Twoim nowym botem.`);
    }
});

// Logowanie się bota przy użyciu tokenu z pliku .env
const token = process.env.TOKEN;
if (token) {
    client.login(token);
} else {
    console.error("Brak tokenu bota w pliku .env! Sprawdź, czy ustawiłeś zmienną TOKEN.");
}