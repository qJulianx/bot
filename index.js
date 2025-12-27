const express = require('express');
const app = express();
const port = 3000;

// Biblioteka do Minecrafta
const util = require('minecraft-server-util'); 

app.get('/', (req, res) => res.send('Bot działa z Lavalink (Full Auto-Fix + Anti-Crash)!'));
app.listen(port, () => console.log(`Nasłuchiwanie na porcie ${port}`));

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Events,
    ActivityType 
} = require('discord.js');

const play = require('./play');
const moderation = require('./moderation');
const automod = require('./automod');

// ==========================================
// KONFIGURACJA MINECRAFT
// ==========================================
const MC_IP = 'gildiafoxy.keyhost.pl';
const MC_PORT = 20031;

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

    // --- SEKCJA STATUSU MINECRAFT ---
    const updateStatus = () => {
        util.status(MC_IP, MC_PORT)
            .then((response) => {
                const statusText = `Serwer MC - Online Graczy: ${response.players.online}`;
                client.user.setActivity(statusText, { type: ActivityType.Playing });
            })
            .catch((error) => {
                client.user.setActivity('Serwer MC - Offline', { type: ActivityType.Watching });
            });
    };

    updateStatus();
    setInterval(updateStatus, 30000);
    // ---------------------------------------

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
    if (play.handleVoiceUpdate) {
        await play.handleVoiceUpdate(oldState, newState);
    }
});

// ==========================================
// SYSTEM ANTI-CRASH (BARDZO WAŻNE!)
// ==========================================
// To zapobiega wyłączaniu się bota przy błędach, których nie przewidzieliśmy
process.on('unhandledRejection', (reason, promise) => {
    console.error(' [Anti-Crash] Unhandled Rejection:', reason);
    // Bot NIE wyłączy się
});

process.on('uncaughtException', (err) => {
    console.error(' [Anti-Crash] Uncaught Exception:', err);
    // Bot NIE wyłączy się
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error(' [Anti-Crash] Uncaught Exception Monitor:', err, origin);
    // Bot NIE wyłączy się
});

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");