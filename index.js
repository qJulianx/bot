const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa z Lavalink (Full Auto-Fix)!'));
app.listen(port, () => console.log(`Nasłuchiwanie na porcie ${port}`));

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Events
} = require('discord.js');

const play = require('./play');
const moderation = require('./moderation');
const automod = require('./automod');

const GUILD_ID = 'WKLEJ_TUTAJ_ID_SWOJEGO_SERWERA'; 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// Inicjalizacja modułu muzycznego
play.init(client);

// ==========================================
// START BOTA
// ==========================================

client.once(Events.ClientReady, async () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

    const commands = [...moderation.commands, ...play.musicCommands, ...automod.commands];


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
// OBSŁUGA INTERAKCJI
// ==========================================
client.on(Events.InteractionCreate, async interaction => {
    if (await play.handleInteraction(interaction)) return;
    if (await moderation.handleInteraction(interaction, client)) return;

    await automod.handleInteraction(interaction, client); 
});

// ==========================================
// KOMENDY TEKSTOWE
// ==========================================
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (await play.handleMessage(message)) return;
    if (await moderation.handleMessage(message)) return;
});

// ==========================================
// OBSŁUGA KANAŁÓW GŁOSOWYCH (AUTO-FIX + MODERACJA)
// ==========================================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    
    // 1. Logika Moderacji (Muteall-ch)
    if (moderation.handleVoiceStateUpdate) {
        await moderation.handleVoiceStateUpdate(oldState, newState);
    }

    // 2. Logika Muzyki (Naprawa po wyrzuceniu bota)
    // To sprawia, że jak wyrzucisz bota, on się zresetuje i będzie gotowy do ponownego wejścia
    if (play.handleVoiceUpdate) {
        await play.handleVoiceUpdate(oldState, newState);
    }
});

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");