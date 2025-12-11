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
const TARGET_CHANNEL_ID = '1448046672188801156'; // Kanał gdzie trafiają podania

// Uprawnienia (skopiowane z innych plików dla spójności)
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
                    .setDescription('Napisz formułkę\n\nJeśli cię nie ma w dniu edycji')
                    .setColor('Blue');

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

    // 2. OBSŁUGA PRZYCISKÓW (Otwieranie formularza i Decyzje Admina)
    if (interaction.isButton()) {
        
        // A. Użytkownik klika "Usprawiedliwienie" -> Otwórz Modal
        if (interaction.customId === 'btn_open_justification') {
            const modal = new ModalBuilder()
                .setCustomId('modal_justification_submit')
                .setTitle('Formularz Usprawiedliwienia');

            const dateFromInput = new TextInputBuilder()
                .setCustomId('date_from')
                .setLabel('Nie będzie mnie od:')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const dateToInput = new TextInputBuilder()
                .setCustomId('date_to')
                .setLabel('Do:')
                .setStyle(TextInputStyle.Short)
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

        // B. Admin klika "Akceptuję"
        if (interaction.customId.startsWith('btn_just_accept:')) {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            const userId = interaction.customId.split(':')[1];
            
            // Pobieramy stary embed i zmieniamy kolor na zielony
            const oldEmbed = interaction.message.embeds[0];
            const newEmbed = new EmbedBuilder(oldEmbed.data)
                .setColor('Green')
                .setFooter({ text: `Zaakceptowano przez: ${interaction.user.tag}` });

            // Edytujemy wiadomość (usuwamy przyciski)
            await interaction.update({ embeds: [newEmbed], components: [] });

            // Wysyłamy DM do użytkownika
            try {
                const user = await client.users.fetch(userId);
                await user.send(`✅ **Twoje usprawiedliwienie zostało zaakceptowane!**\nAdministrator: ${interaction.user.tag}`);
            } catch (e) {
                await interaction.followUp({ content: '⚠️ Zaakceptowano, ale nie udało się wysłać DM do użytkownika (zablokowane PW).', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // C. Admin klika "Odrzuć" -> Otwórz Modal powodu
        if (interaction.customId.startsWith('btn_just_reject:')) {
            if (!checkPermissions(interaction.member)) return interaction.reply({ content: '⛔ Brak uprawnień.', flags: MessageFlags.Ephemeral });

            const userId = interaction.customId.split(':')[1];
            // Przekazujemy ID wiadomości w ID modala, żeby wiedzieć którą wiadomość edytować po wypełnieniu powodu
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

    // 3. OBSŁUGA FORMULARZY (MODALS)
    if (interaction.isModalSubmit()) {

        // A. Użytkownik wysłał usprawiedliwienie
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

            // Przyciski dla admina (przekazujemy ID usera w customId)
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

        // B. Admin podał powód odrzucenia
        if (interaction.customId.startsWith('modal_just_reject_reason:')) {
            const [, userId, messageId] = interaction.customId.split(':');
            const reason = interaction.fields.getTextInputValue('reject_reason');

            // Pobieramy wiadomość z podania
            const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (!message) return interaction.reply({ content: '❌ Nie znaleziono wiadomości.', flags: MessageFlags.Ephemeral });

            // Edytujemy embed na czerwony
            const oldEmbed = message.embeds[0];
            const newEmbed = new EmbedBuilder(oldEmbed.data)
                .setColor('Red')
                .addFields({ name: '❌ Odrzucono', value: `Powód: ${reason}` })
                .setFooter({ text: `Odrzucono przez: ${interaction.user.tag}` });

            await message.edit({ embeds: [newEmbed], components: [] });
            await interaction.reply({ content: '✅ Odrzucono podanie.', flags: MessageFlags.Ephemeral });

            // Wysyłamy DM
            try {
                const user = await client.users.fetch(userId);
                await user.send(`⛔ **Twoje usprawiedliwienie zostało odrzucone.**\nPowód: ${reason}\nAdministrator: ${interaction.user.tag}`);
            } catch (e) {
                // Ignore DM closed
            }
        }
    }
}

module.exports = {
    commands,
    handleInteraction
};