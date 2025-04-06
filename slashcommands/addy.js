const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addy')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDescription('Get this thread ltc addy'),
    async execute(client, interaction) {
        let thread = await interaction.channel;
        let ID = interaction.channelId;

        await interaction.reply({
            content: `> 🔎 Finding Key In Data .  .  .  .`,
            ephemeral: true
        })
        const LTCaddy = await getData(ID);
        if (LTCaddy) {
            return interaction.editReply({
                content: `> 📍 Addy : ${LTCaddy}`,
                ephemeral: true
            });
        } else {
            interaction.editReply({
                content: `⭕ Record  ${ID} was not found.`,
                ephemeral: true
            });
        }
        async function getData(ID) {
            try {
                const filePath = './trades.json';
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const record = data[ID];
                if (record) {
                    return record.LTCaddy;
                } else {
                    return null

                }
            } catch (error) {
                console.error('Error reading or parsing trades.json:', error);
                return null;
            }
        }
    },
};