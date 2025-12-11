const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Bot działa z Lavalink (Smart Panel + Pętla + Volume + Permissions)!'));
app.listen(port, () => console.log(`Nasłuchiwanie na porcie ${port}`));

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Events
} = require('discord.js');

const play = require('./play');
const moderation = require('./moderation');

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

// Inicjalizacja modułu muzycznego (musi być przed loginem)
play.init(client);

// ==========================================
// START BOTA
// ==========================================

client.once(Events.ClientReady, async () => {
	console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

    // Łączenie komend muzycznych i moderacyjnych
    const commands = [...moderation.commands, ...play.musicCommands];

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
// OBSŁUGA INTERAKCJI (SLASH + BUTTONS + MODALS)
// ==========================================
client.on(Events.InteractionCreate, async interaction => {
    
    // Sprawdzamy moduł muzyczny
    if (await play.handleInteraction(interaction)) return;

    // Sprawdzamy moduł moderacyjny (zawiera również giverole/ungiverole/muteall)
    if (await moderation.handleInteraction(interaction, client)) return;

});

// ==========================================
// KOMENDY TEKSTOWE
// ==========================================
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // Sprawdzamy moduł muzyczny
    if (await play.handleMessage(message)) return;

    // Sprawdzamy moduł moderacyjny
    if (await moderation.handleMessage(message)) return;
});

// ==========================================
// OBSŁUGA KANAŁÓW GŁOSOWYCH (WAŻNE DLA MUTEALL i MUZYKI)
// ==========================================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    
    // 1. Przekazujemy zdarzenie do modułu moderacji
    // To obsługuje tryby 'ch-all-time' (wyciszanie wchodzących) i 'one' (odciszanie po wyjściu admina)
    if (moderation.handleVoiceStateUpdate) {
        await moderation.handleVoiceStateUpdate(oldState, newState);
    }

    // 2. Tutaj można ewentualnie dodać logikę naprawy bota muzycznego (Zombie Player),
    // ale w strukturze modułowej najlepiej, gdyby play.js sam to obsługiwał w init().
    // Jeśli bot muzyczny się zatnie po wyrzuceniu, daj znać - dodamy tu fix.
});

const token = process.env.TOKEN;
if (token) client.login(token);
else console.error("Brak tokenu!");