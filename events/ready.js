const {
    Events,
    REST,
    Routes,
    ActivityType
} = require('discord.js');
const toml = require('toml');
const fs = require('fs');
const wait = require('wait');
let config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));
module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.clear()
        await require('../database/mongodb')(client);
        await wait(1000)
        console.log(`👋 $Aryan (And Paxel ✋) Welcome you to the Greatest Auto-Middleman Bot \n\n✅ Bot is Ready to use! Logged in as ${client.user.tag}`);

        await client.user.setPresence({
            activities: [{
                name: `FusionMM`,
                type: ActivityType.Watching
            }],
            status: 'dnd',
        });

        try {
            const rest = new REST({
                version: '10'
            }).setToken(client.config.token)

            let guildId = client.config.guildID
            let guild = client.guilds.cache.get(guildId)

            const commands = [];

            const commandFiles = fs.readdirSync('./slashcommands').filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const command = require(`../slashcommands/${file}`);
                commands.push(command.data.toJSON());
            }

            await rest.put(
                Routes.applicationCommands(client.user.id), {
                    body: commands
                },
            );


        } catch (err) {
            console.log('\x1b[31m%s\x1b[0m', `⚠️ Error while registering slash commands: \n${err} \n\n`); // Red color
        }
    },
};