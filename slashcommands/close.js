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
        .setName('close')
        .setDefaultMemberPermissions(PermissionFlagsBits.Admininstrator)
        .setDescription('Close a thread (admins only)'),
    async execute(client, interaction) {


	const thread = interaction.thread
	await thread.send('This trade will be closed and deleted in 30 seconds.');
        await new Promise(resolve => setTimeout(resolve, 30000));
        await thread.setLocked(true);
        await thread.setName('Closed!');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await thread.delete().catch(error => console.log('Error deleting thread:', error));



        }
    }