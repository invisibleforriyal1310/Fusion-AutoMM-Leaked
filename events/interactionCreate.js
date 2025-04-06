const {
    Events,
    EmbedBuilder,
    ActionRowBuilder,
    AttachmentBuilder,
    permissionOverwrites,
    PermissionsBitField,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ThreadAutoArchiveDuration,
    Client
} = require('discord.js');
const toml = require('toml');
const fs = require('fs');
const Trade = require('../functions/trade');
let config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));
const wait = require('util').promisify(setTimeout);
const {
    readdirSync
} = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const {
    createLogger,
    format,
    transports
} = require('winston');
const discordTranscripts = require('discord-html-transcripts');


const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({
            timestamp,
            level,
            message
        }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({
            filename: 'combined.log'
        })
    ]
});

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {

        if (interaction.isChatInputCommand()) {

            const commandFiles = fs.readdirSync('./slashcommands').filter(file => file.endsWith('.js'));

            const commands = await Promise.all(commandFiles.map(async file => {
                const command = require(`../slashcommands/${file}`);
                return {
                    name: command.data.name.toLowerCase(),
                    execute: command.execute
                };
            }));

            const command = commands.find(cmd => cmd.name === interaction.commandName.toLowerCase());

            if (!command) return;

            if (!config.admin.includes(interaction.user.id) && command.name === 'recovery') {
                await interaction.reply('Unauthorized!');
            } else {
                await command.execute(interaction.client, interaction);
            }


        }

        try {

            if (interaction.isButton()) {


                if (interaction.customId === 'id_help') {

                    await interaction.reply({
                        content: `Soon`,
                        ephemeral: true
                    });
                }

                if (interaction.customId.toLowerCase().startsWith('paste')) {
                    try {
                        if (!interaction.replied && !interaction.deferred) {
                            const parts = interaction.customId.split('|');
                            if (parts.length >= 3) {
                                const addy = parts[1];
                                const ltcamount = parts[2];

                                if (addy) {
                                    const ltc_addy = `${addy}`;
                                    await interaction.reply({
                                        content: ltc_addy,
                                        ephemeral: true,
                                    });
                                }

                                if (ltcamount) {
                                    const ltc_amount = `${ltcamount}`;
                                    await interaction.followUp({
                                        content: ltc_amount,
                                        ephemeral: true,
                                    });
                                }
                            } else {
                                await interaction.reply({
                                    content: 'Invalid customId format',
                                    ephemeral: true,
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error handling button click:', error);
                    }
                }



                if (interaction.customId.toLowerCase().startsWith('transcript')) {

                    let channel = interaction.channel
                    let client = interaction.client;
                    const attachment = await discordTranscripts.createTranscript(channel, {
                        callbacks: {
                            resolveChannel: async (channelId) => client.channels.cache.get(channelId) || null,
                            resolveUser: async (userId) => client.users.fetch(userId).catch(() => null),
                            resolveRole: async (roleId) => interaction.channel.guild.roles.cache.get(roleId) || null,
                        },
                        poweredBy: false,
                        ssr: true
                    });
                    await interaction.reply({ content: `We sent a copy of the transcript in your dm's.`, ephemeral: true })
                    await interaction.user.send({ embeds: [new EmbedBuilder().setTitle('Fusion MM Transcript').setTimestamp().setColor('Blue')], files: [attachment] }).catch(err => console.log(err))
                }




                if (interaction.customId.toLowerCase().startsWith('qr')) {
                    try {
                        await interaction.deferReply({
                            ephemeral: true
                        });
                        const [_, addy, amount] = interaction.customId.split('|');
                        const qr_buffer = `litecoin:${addy}?amount=${amount}`;
                        const qr_path = path.resolve(__dirname, '../', `${addy}.png`);


                        await QRCode.toFile(qr_path, qr_buffer, {
                            color: {
                                dark: '#000000',
                                light: '#FFFFFF'
                            },
                            width: 512,
                            height: 512
                        });

                        const buffer = fs.readFileSync(qr_path);
                        const attachment = new AttachmentBuilder(buffer, `${addy}.png`);
                        const embed = new EmbedBuilder()
                            .setTitle(`QR Code for Address: ${addy}`)
                            .setImage(`attachment://${addy}.png`)
                            .setColor('#0099ff');

                        await interaction.editReply({
                            embeds: [embed],
                            files: [attachment],
                            ephemeral: false
                        });
                        setTimeout(() => fs.unlink(qr_path, (err) => err && console.error('Failed to delete QR code image:', err)), 5000);
                    } catch (error) {
                        console.error('Error generating QR code:', error);
                        await interaction.editReply({
                            content: 'An error occurred while generating the QR code.',
                            ephemeral: true
                        });
                    }
                }



                if (interaction.customId === 'create_new_deal') {
                    try {
                        await interaction.deferReply({
                            ephemeral: true
                        });

                        const channel = interaction.guild.channels.cache.get(config.thread_channel);
                        if (!channel) {
                            await interaction.editReply({
                                content: 'Channel not found.',
                                ephemeral: true
                            });
                            return;
                        }

                        const thread = await channel.threads.create({
                            name: `Trade with @${interaction.user.username}`,
                            autoArchiveDuration: ThreadAutoArchiveDuration.Max,
                            type: ChannelType.PrivateThread,
                            reason: 'LiteCoin Escrow!',
                            invitable: false,
                        });

                        await thread.members.add(interaction.user.id);


                        const confirm = new EmbedBuilder()
                            .setTitle('Confirm Trade Creation')
                            .setDescription('Are you sure you want to open a trade?')
                            .setColor(0x303238);

                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('openTrade').setLabel('Open Trade').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('cancelTrade').setLabel('Cancel').setStyle(ButtonStyle.Danger)
                        );

                        const msg = await thread.send({
                            embeds: [confirm],
                            components: [row]
                        });

                        const filter = handleButton => handleButton.user.id === interaction.user.id;
                        const collector = thread.createMessageComponentCollector({
                            filter,
                            time: 60000 * 3
                        });

                        collector.on('collect', async (handleButton) => {
                            try {
                                if (handleButton.customId === 'openTrade') {
                                    await handleButton.deferUpdate();
                                    const trade = new Trade(handleButton, thread);
                                    queueMicrotask(() => trade.start(msg));
                                } else if (handleButton.customId === 'cancelTrade') {
                                    await handleButton.update({
                                        content: 'Trade cancelled!',
                                        components: []
                                    });
                                    await thread.delete();
                                }
                            } catch (error) {
                                logger.error('Error handling button interaction:', error);
                            }
                        });


                        collector.on('end', async (collected, reason) => {

                            if (reason == 'time') {
                                if (collected.size == 0) {
                                    thread.delete().catch(error => console.log('Deleting Message . . . ', error))
                                }
                            }

                        })
                        await interaction.editReply({
                            content: `Created Trade → <#${thread.id}>`,
                            ephemeral: true
                        });
                    } catch (error) {
                        logger.error('Error creating trade:', error);
                        await interaction.editReply({
                            content: 'An error occurred while creating the trade.',
                            ephemeral: true
                        });
                    }
                }
            }


        } catch (err) {
            console.log('Error In Interaction :', err)
        }

    }
}