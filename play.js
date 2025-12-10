const { Kazagumo } = require("kazagumo");
const { Connectors } = require("shoukaku");
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    MessageFlags 
} = require('discord.js');

// ==========================================
// PAMIĘĆ BOTA (MUZYKA)
// ==========================================
const twentyFourSeven = new Map(); 
const emptyTimers = new Map();     
const lastPanelMessage = new Map(); 

// ==========================================
// KONFIGURACJA LAVALINK
// ==========================================
const NODES = [
    {
        name: 'AjieDev-V4', 
        url: 'lava-v4.ajieblogs.eu.org:443', 
        auth: 'https://dsc.gg/ajidevserver', 
        secure: true 
    },
    {
        name: 'AjieDev-V4.2', 
        url: 'lavalinkv4.serenetia.com:443', 
        auth: 'https://dsc.gg/ajidevserver', 
        secure: true 
    },
    {
        name: 'AjieDev-V4.2', 
        url: 'lava-v4.ajieblogs.eu.org:80', 
        auth: 'https://dsc.gg/ajidevserver', 
        secure: false 
    },
    {
        name: 'AjieDev-V4.2', 
        url: 'lavalinkv4-id.serenetia.com', 
        auth: 'https://dsc.gg/ajidevserver', 
        secure: true 
    },
    {
        name: 'AjieDev-LDP-NoSSL',
        url: 'lava-all.ajieblogs.eu.org:80',
        auth: 'https://dsc.gg/ajidevserver',
        secure: false
    },
    {
        name: 'Serenetia-V4',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    }
];

let kazagumo;

// ==========================================
// FUNKCJE POMOCNICZE
// ==========================================
function generateQueueString(player) {
    if (!player) return 'Nic nie gra.';

    const prev = player.queue.previous || [];
    const historyList = prev.slice(-5).map((t, i) => `🔙 ${i + 1}. ~~${t.title}~~`).join('\n');
    const current = `💿 **${player.queue.current?.title || 'Nieznany'}**`;
    const nextList = player.queue.slice(0, 10).map((t, i) => `🔜 ${i + 1}. ${t.title}`).join('\n');

    let finalString = '';
    if (historyList) finalString += `**Już leciało:**\n${historyList}\n\n`;
    finalString += `**Teraz gra:**\n${current}\n\n`;
    
    if (nextList) {
        finalString += `**Następne w kolejce:**\n${nextList}`;
    } else {
        finalString += `**Następne w kolejce:**\n(Koniec kolejki)`;
    }

    if (player.queue.length > 10) finalString += `\n\n...i ${player.queue.length - 10} więcej.`;

    return finalString;
}

// ==========================================
// INICJALIZACJA
// ==========================================
function init(client) {
    kazagumo = new Kazagumo({
        defaultSearchEngine: "youtube", 
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        }
    }, new Connectors.DiscordJS(client), NODES, {
        extends: {
            player: {
                savePreviousSongs: true 
            }
        }
    });

    // ==========================================
    // EVENTY MUZYCZNE (SMART PANEL)
    // ==========================================
    kazagumo.on("playerStart", async (player, track) => {
        if (emptyTimers.has(player.guildId)) {
            clearTimeout(emptyTimers.get(player.guildId));
            emptyTimers.delete(player.guildId);
        }

        const channel = client.channels.cache.get(player.textId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('🎶 Gramy:')
            .setDescription(`[${track.title}](${track.uri})`)
            .addFields(
                { name: 'Autor', value: track.author || 'Nieznany', inline: true },
                { name: 'Długość', value: track.isStream ? 'LIVE' : new Date(track.length).toISOString().substr(14, 5), inline: true },
                { name: 'Dodał', value: track.requester ? `<@${track.requester.id}>` : 'Ktoś', inline: true }
            )
            .setThumbnail(track.thumbnail || null)
            .setColor('Green');

        let loopStatus = 'OFF';
        if (player.loop === 'queue') loopStatus = 'Kolejka';
        if (player.loop === 'track') loopStatus = 'Utwór';
        
        const is247 = twentyFourSeven.get(player.guildId) || false;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setLabel('Pauza').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setLabel('Skip').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_247').setEmoji('🔁').setLabel(is247 ? '24/7: ON' : '24/7: OFF').setStyle(is247 ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_queue').setEmoji('📜').setLabel('Lista').setStyle(ButtonStyle.Secondary)
        );

        const nodeName = player.shoukaku.node.name;
        let footerText = `🔊 Vol: ${player.volume}% | Lavalink: ${nodeName}`;
        if (player.loop !== 'none') footerText += ` | 🔁 Pętla: ${loopStatus}`;
        embed.setFooter({ text: footerText });

        let messageUpdated = false;
        const lastMsgId = lastPanelMessage.get(player.guildId);

        if (lastMsgId) {
            const lastChannelMsgId = channel.lastMessageId;
            if (lastChannelMsgId === lastMsgId) {
                try {
                    const existingMsg = await channel.messages.fetch(lastMsgId);
                    if (existingMsg) {
                        await existingMsg.edit({ embeds: [embed], components: [row] });
                        messageUpdated = true;
                    }
                } catch (e) { messageUpdated = false; }
            } else {
                try {
                    const oldMsg = await channel.messages.fetch(lastMsgId).catch(() => null);
                    if (oldMsg) await oldMsg.delete();
                } catch (e) {}
            }
        }

        if (!messageUpdated) {
            const msg = await channel.send({ embeds: [embed], components: [row] });
            lastPanelMessage.set(player.guildId, msg.id);
        }
    });

    kazagumo.on("playerEnd", (player) => {});

    kazagumo.on("playerEmpty", async (player) => {
        const channel = client.channels.cache.get(player.textId);
        
        // if (lastPanelMessage.has(player.guildId)) {
        //     const lastMsgId = lastPanelMessage.get(player.guildId);
        //     try {
        //         const oldMsg = await channel.messages.fetch(lastMsgId).catch(() => null);
        //         if (oldMsg) await oldMsg.delete();
        //     } catch (e) {}
        //     lastPanelMessage.delete(player.guildId);
        // }

        if (twentyFourSeven.get(player.guildId)) {
            if (channel) channel.send("zzz... Kolejka pusta, ale czekam (Tryb 24/7).");
            return; 
        }

        if (channel) channel.send("⏳ Kolejka pusta. Wyjdę za **1 minutę**, jeśli nic nie puścisz.");

        const timer = setTimeout(() => {
            if (!player.queue.length && !player.playing) {
                player.destroy();
                if (channel) channel.send("⏹️ Brak aktywności. Wychodzę z kanału.");
                emptyTimers.delete(player.guildId);
            }
        }, 60 * 1000); 

        emptyTimers.set(player.guildId, timer);
    });

    kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink Node ${name} jest gotowy!`));
    kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink Node ${name} błąd:`, error));
}

// ==========================================
// LISTA KOMEND
// ==========================================
const musicCommands = [
    new SlashCommandBuilder().setName('play').setDescription('Odtwarza muzykę').addStringOption(o => o.setName('utwor').setDescription('Link lub Tytuł').setRequired(true)),
    new SlashCommandBuilder().setName('stop').setDescription('Zatrzymuje muzykę'),
    new SlashCommandBuilder().setName('skip').setDescription('Pomija utwór'),
    new SlashCommandBuilder().setName('queue').setDescription('Pokazuje kolejkę'),
    new SlashCommandBuilder()
        .setName('pętla')
        .setDescription('Ustawia tryb pętli')
        .addStringOption(option =>
            option.setName('tryb')
                .setDescription('Wybierz tryb pętli')
                .setRequired(true)
                .addChoices(
                    { name: '❌ Wyłącz', value: 'off' },
                    { name: '🔂 Utwór (jeden)', value: 'track' },
                    { name: '🔁 Kolejka (wszystko)', value: 'queue' },
                    { name: '🔀 Losowa (Shuffle + Pętla)', value: 'random' }
                )
        ),
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Ustawia głośność odtwarzania (0-200%)')
        .addIntegerOption(option =>
            option.setName('poziom')
                .setDescription('Procent głośności (np. 50, 100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(200)
        )
];

// ==========================================
// OBSŁUGA INTERAKCJI
// ==========================================
async function handleInteraction(interaction) {
    if (interaction.isButton()) {
        if (['music_pause', 'music_skip', 'music_stop', 'music_queue', 'music_247'].includes(interaction.customId)) {
            
            const player = kazagumo.players.get(interaction.guildId);

            if (interaction.customId === 'music_247') {
                if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });
                const currentState = twentyFourSeven.get(interaction.guildId) || false;
                twentyFourSeven.set(interaction.guildId, !currentState);

                // Aktualizujemy przycisk na panelu
                const newState = !currentState;
                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setLabel('Pauza').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setLabel('Skip').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setLabel('Stop').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('music_247').setEmoji('🔁').setLabel(newState ? '24/7: ON' : '24/7: OFF').setStyle(newState ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_queue').setEmoji('📜').setLabel('Lista').setStyle(ButtonStyle.Secondary)
                );

                await interaction.message.edit({ components: [newRow] });
                return interaction.deferUpdate();
            }

            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

            if (interaction.customId === 'music_pause') {
                const isPaused = !player.paused;
                player.setPaused(isPaused);
                return interaction.reply({ content: isPaused ? '⏸️ Zauzowano.' : '▶️ Wznowiono.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.customId === 'music_skip') {
                player.skip();
                return interaction.deferUpdate();
            }

            if (interaction.customId === 'music_stop') {
                if (player) {
                    player.destroy();
                    // Panel zostaje
                    return interaction.reply({ content: '⏹️ Zatrzymano i wyczyszczono.' });
                } else {
                    // Anty-bug: Jeśli bota nie ma w pamięci, ale jest na kanale -> wyrzuć go
                    const me = interaction.guild.members.me;
                    if (me.voice.channel) {
                        await me.voice.disconnect();
                        return interaction.reply({ content: '⚠️ Wykryto "martwe" połączenie. Wymuszono rozłączenie.', flags: MessageFlags.Ephemeral });
                    }
                    return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
                }
            }

            if (interaction.customId === 'music_queue') {
                 const queueText = generateQueueString(player);
                 return interaction.reply({ content: queueText, flags: MessageFlags.Ephemeral });
            }

            return true; // Obsłużono
        }
    }

    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'play') {
            const { channel } = interaction.member.voice;
            if (!channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

            const query = interaction.options.getString('utwor');
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                if (emptyTimers.has(interaction.guildId)) {
                    clearTimeout(emptyTimers.get(interaction.guildId));
                    emptyTimers.delete(interaction.guildId);
                }

                const player = await kazagumo.createPlayer({
                    guildId: interaction.guildId,
                    textId: interaction.channelId,
                    voiceId: channel.id,
                    volume: 40,
                    savePreviousSongs: true 
                });

                const result = await kazagumo.search(query, { requester: interaction.user });
                if (!result.tracks.length) return interaction.editReply("❌ Nie znaleziono utworu.");

                if (result.type === "PLAYLIST") {
                    for (let track of result.tracks) player.queue.add(track);
                    await interaction.editReply(`✅ Dodano playlistę: **${result.playlistName}** (${result.tracks.length} utworów)`);
                } else {
                    player.queue.add(result.tracks[0]);
                    await interaction.editReply(`✅ Dodano do kolejki: **${result.tracks[0].title}**`);
                }

                if (!player.playing && !player.paused) player.play();

            } catch (e) {
                console.error('Błąd Lavalink:', e);
                await interaction.editReply({ content: `❌ Błąd połączenia z węzłem Lavalink.` });
            }
            return true;
        }

        if (interaction.commandName === 'stop') {
            const player = kazagumo.players.get(interaction.guildId);
            if (player) {
                player.destroy();
                await interaction.reply('⏹️ Zatrzymano i rozłączono.');
            } else {
                // Anty-bug
                const me = interaction.guild.members.me;
                if (me.voice.channel) {
                    await me.voice.disconnect();
                    await interaction.reply({ content: '⚠️ Wykryto "martwe" połączenie. Wymuszono rozłączenie.', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
                }
            }
            return true;
        }

        if (interaction.commandName === 'skip') {
            const player = kazagumo.players.get(interaction.guildId);
            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            player.skip();
            await interaction.reply('⏭️ Pominięto.');
            return true;
        }

        if (interaction.commandName === 'queue') {
            const player = kazagumo.players.get(interaction.guildId);
            const queueText = generateQueueString(player);
            await interaction.reply({ content: queueText, flags: MessageFlags.Ephemeral });
            return true;
        }

        if (interaction.commandName === 'pętla') {
            const player = kazagumo.players.get(interaction.guildId);
            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            
            const mode = interaction.options.getString('tryb');

            if (mode === 'off') {
                player.setLoop('none');
                return interaction.reply({ content: '❌ Pętla wyłączona.', flags: MessageFlags.Ephemeral });
            }

            if (mode === 'track') {
                player.setLoop('track');
                return interaction.reply({ content: '🔂 Pętla utworu włączona.', flags: MessageFlags.Ephemeral });
            }

            if (mode === 'queue') {
                player.setLoop('queue');
                return interaction.reply({ content: '🔁 Pętla kolejki włączona.', flags: MessageFlags.Ephemeral });
            }

            if (mode === 'random') {
                player.setLoop('queue'); 
                player.queue.shuffle();  
                return interaction.reply({ content: '🔀 Pętla losowa włączona (kolejka wymieszana i zapętlona).', flags: MessageFlags.Ephemeral });
            }
            return true;
        }

        if (interaction.commandName === 'volume') {
            const player = kazagumo.players.get(interaction.guildId);
            if (!player) return interaction.reply({ content: '⛔ Nic teraz nie gra.', flags: MessageFlags.Ephemeral });
            
            if (!interaction.member.voice.channel) return interaction.reply({ content: '❌ Musisz być na kanale głosowym!', flags: MessageFlags.Ephemeral });

            const volume = interaction.options.getInteger('poziom');
            player.setVolume(volume);
            
            return interaction.reply({ content: `🔊 Głośność ustawiona na **${volume}%**.`, flags: MessageFlags.Ephemeral });
        }
    }
    return false;
}

// ==========================================
// OBSŁUGA KOMEND TEKSTOWYCH (np. !play)
// ==========================================
async function handleMessage(message) {
    if (message.content.startsWith('!play')) {
        const { channel } = message.member.voice;
        if (!channel) return message.reply('❌ Musisz być na kanale głosowym!');
        const query = message.content.split(' ').slice(1).join(' ');
        if (!query) return message.reply('❌ Podaj tytuł.');
        
        try {
            if (emptyTimers.has(message.guildId)) {
                clearTimeout(emptyTimers.get(message.guildId));
                emptyTimers.delete(message.guildId);
            }

            const player = await kazagumo.createPlayer({
                guildId: message.guildId,
                textId: message.channelId,
                voiceId: channel.id,
                volume: 40,
                savePreviousSongs: true
            });
            const result = await kazagumo.search(query, { requester: message.author });
            if (!result.tracks.length) return message.reply("❌ Nie znaleziono.");
            
            player.queue.add(result.tracks[0]);
            if (!player.playing && !player.paused) player.play();
            message.react('🎵');
        } catch (e) { console.error(e); }
        return true;
    }
    return false;
}

module.exports = {
    init,
    musicCommands,
    handleInteraction,
    handleMessage
};
