const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa (Tryb Minimalny)!'));
app.listen(port, () => console.log(`Nasłuchiwanie na porcie ${port}`));

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Tworzymy klienta z absolutnym minimum
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // Podstawowy intent
    ],
});

client.once('ready', () => {
    console.log('✅ SUKCES! Bot połączył się z Discordem.');
    console.log(`Zalogowano jako: ${client.user.tag}`);
});

console.log("⏳ Próba logowania...");

const token = process.env.TOKEN;
client.login(token).catch(err => {
    console.error("❌ BŁĄD LOGOWANIA:");
    console.error(err);
});