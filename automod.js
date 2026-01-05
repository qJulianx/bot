const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionsBitField,
    MessageFlags 
} = require('discord.js');

// ==========================================
// KONFIGURACJA
// ==========================================
const TARGET_CHANNEL_ID = '1448767076180299826'; // Kanał gdzie trafiają podania

// Uprawnienia
const ALLOWED_ROLES = [
    '1447757045947174972', 
    '1447764029882896487', 
    '1447970901575471286', 
    '1446904206903742534'  
];

function checkPermissions(member) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

// ==========================================
// DEFINICJA KOMENDY
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('create-panel')
        .setDescription('Tworzy panel systemowy (np. usprawiedliwienia)')
        .addStringOption(option =>
            option.setName('wybor')
                .setDescription('Wybierz jaki panel stworzyć')
                .setRequired(true)
                .addChoices(
                    { name: 'Usprawiedliwienia', value: 'usprawiedliwienia' }
                )
        )
];

// ==========================================
// FUNKCJA: AUTOMOD NICKÓW (NOWOŚĆ)
// ==========================================
async function handleNicknameCheck(member) {
    // 1. Nie sprawdzamy botów ani administratorów (żeby uniknąć wojen edycyjnych)
    if (member.user.bot) return;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    // 2. Pobieramy wyświetlaną nazwę (Nick lub Username)
    const displayName = member.displayName;

    // 3. Sprawdzamy czy zaczyna się od "!" (Anti-Hoist)
    if (displayName.startsWith('!')) {
        
        // Usuwamy wszystkie wykrzykniki z początku nazwy
        // Regex: ^ oznacza początek, !+ oznacza jeden lub więcej wykrzykników
        let newName = displayName.replace(/^!+/, '').trim();

        // Jeśli po usunięciu nazwa jest pusta (ktoś miał nick "!!!"), dajemy domyślny
        if (newName.length === 0) {
            newName = "Zmieniony Nick";
        }

        try {
            // Zmieniamy nick
            await member.setNickname(newName);
            console.log(`[AutoMod] Zmieniono nick użytkownika ${member.user.tag} z "${displayName}" na "${newName}"`);
        } catch (error) {
            // To się stanie, jeśli bot ma niższą rolę niż użytkownik
            // console.error(`[AutoMod] Nie udało się zmienić nicku dla ${member.user.tag}. Brak uprawnień.`);
        }
    }
}

// ==========================================
// OBSŁUGA INTERAKCJI
// ==========================================
async function handleInteraction(interaction, client) {

    // 1. OBSŁUGA KOMENDY /create-panel
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'create-panel') {
            if (!checkPermissions(interaction.member)) {
                return interaction.reply({ content: '⛔ Nie masz uprawnień.', flags: MessageFlags.Ephemeral });
            }

            const selection = interaction.options.getString('wybor');

            if (selection === 'usprawiedliwienia') {
                const embed = new EmbedBuilder()
                    .setTitle('Usprawiedliwienie')
                    .setDescription('Napisz formułkę\nJeśli cię nie ma w dniu edycji')
                    .setColor('Purple');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_open_justification')
                        .setLabel('Usprawiedliwienie')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: '✅ Panel usprawiedliwień został stworzony.', flags: MessageFlags.Ephemeral });
            }
        }
    }

    // 2. OBSŁUGA PRZYCISKÓW
    if (interaction.isButton()) {
        
        if (interaction.customId === 'btn_open_justification') {
            const modal = new ModalBuilder()
                .setCustomId('modal_justification_submit')
                .setTitle('Formularz Usprawiedliwienia');

            const dateFromInput = new TextInputBuilder()
                .setCustomId('date_from')
                .setLabel('Nie będzie mnie od:')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('DD.MM.RRRR')
                .setRequired(true);

            const dateToInput = new TextInputBuilder()
                .setCustomId('date_to')
                .setLabel('Do:')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('DD.MM.RRRR')
                .setRequired(true);

            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Powód:')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Podaj przyczynę nieobecności')
                .setRequired(true);

            const row1 = new ActionRowBuilder().addComponents(dateFromInput);
            const row2 = new ActionRowBuilder().addComponents(dateToInput);
            const row3 = new ActionRowBuilder().addComponents(reasonInput);

            modal.addComponents(row1, row2, row3);
            return interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('btn_just_accept:')) {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            const userId = interaction.customId.split(':')[1];
            
            const oldEmbed = interaction.message.embeds[0];
            const newEmbed = new EmbedBuilder(oldEmbed.data)
                .setColor('Green')
                .setFooter({ text: `Zaakceptowano przez: ${interaction.user.tag}` });

            await interaction.update({ embeds: [newEmbed], components: [] });

            try {
                const user = await client.users.fetch(userId);
                await user.send(`✅ **Twoje usprawiedliwienie zostało zaakceptowane!**\nAdministrator: ${interaction.user.tag}`);
            } catch (e) {
                await interaction.followUp({ content: '⚠️ Zaakceptowano, ale nie udało się wysłać DM (zablokowane PW).', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        if (interaction.customId.startsWith('btn_just_reject:')) {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            const userId = interaction.customId.split(':')[1];
            const messageId = interaction.message.id;

            const modal = new ModalBuilder()
                .setCustomId(`modal_just_reject_reason:${userId}:${messageId}`)
                .setTitle('Powód odrzucenia');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reject_reason')
                .setLabel('Powód odrzucenia:')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(reasonInput);
            modal.addComponents(row);

            return interaction.showModal(modal);
        }
    }

    // 3. OBSŁUGA FORMULARZY
    if (interaction.isModalSubmit()) {

        if (interaction.customId === 'modal_justification_submit') {
            const dateFrom = interaction.fields.getTextInputValue('date_from');
            const dateTo = interaction.fields.getTextInputValue('date_to');
            const reason = interaction.fields.getTextInputValue('reason');

            const targetChannel = client.channels.cache.get(TARGET_CHANNEL_ID);
            if (!targetChannel) {
                return interaction.reply({ content: '❌ Błąd konfiguracji: Nie znaleziono kanału docelowego.', flags: MessageFlags.Ephemeral });
            }

            const reportEmbed = new EmbedBuilder()
                .setTitle(`📝 Nowe Usprawiedliwienie: ${interaction.user.tag}`)
                .setColor('Blue')
                .addFields(
                    { name: '👤 Użytkownik', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📅 Od', value: dateFrom, inline: true },
                    { name: '📅 Do', value: dateTo, inline: true },
                    { name: '❓ Powód', value: reason }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_just_accept:${interaction.user.id}`)
                    .setLabel('Akceptuję')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`btn_just_reject:${interaction.user.id}`)
                    .setLabel('Odrzuć')
                    .setEmoji('⛔')
                    .setStyle(ButtonStyle.Danger)
            );

            await targetChannel.send({ embeds: [reportEmbed], components: [row] });
            return interaction.reply({ content: '✅ Twoje usprawiedliwienie zostało wysłane do administracji.', flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId.startsWith('modal_just_reject_reason:')) {
            const [, userId, messageId] = interaction.customId.split(':');
            const reason = interaction.fields.getTextInputValue('reject_reason');

            const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (!message) return interaction.reply({ content: '❌ Nie znaleziono wiadomości.', flags: MessageFlags.Ephemeral });

            const oldEmbed = message.embeds[0];
            const newEmbed = new EmbedBuilder(oldEmbed.data)
                .setColor('Red')
                .addFields({ name: '❌ Odrzucono', value: `Powód: ${reason}` })
                .setFooter({ text: `Odrzucono przez: ${interaction.user.tag}` });

            await message.edit({ embeds: [newEmbed], components: [] });
            await interaction.reply({ content: '✅ Odrzucono podanie.', flags: MessageFlags.Ephemeral });

            try {
                const user = await client.users.fetch(userId);
                await user.send(`⛔ **Twoje usprawiedliwienie zostało odrzucone.**\nPowód: ${reason}\nAdministrator: ${interaction.user.tag}`);
            } catch (e) {}
        } 
    }
}

module.exports = {
    commands,
    handleInteraction,
    handleNicknameCheck // <--- WAŻNE: Eksportujemy nową funkcję
};