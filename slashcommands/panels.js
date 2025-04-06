const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const createPanel = require('../functions/createPanel.js').createPanel
module.exports = {

    data: new SlashCommandBuilder()
        .setName('panels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Admininstrator)
        .setDescription('Create new MM panels'),
    async execute(client, interaction) {
        await createPanel(client, interaction)
        return await interaction.reply({
            content: '> Created new panels',
            ephemeral: true
        })

    },
};