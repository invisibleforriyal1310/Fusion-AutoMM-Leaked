const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const axios = require('axios');
const toml = require('toml');
const fs = require('fs');
const config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changelog')
        .setDescription('Shows the Changelog'),
    async execute(client, interaction) {

        await interaction.reply({
            content: `Started working on Bitcoin as Currency for the trade. \nStarted working on the function to choose between Euro or USD for the trade.`,
            ephemeral: true
        })
    }
}