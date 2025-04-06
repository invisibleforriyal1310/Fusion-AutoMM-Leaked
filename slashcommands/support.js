const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    WebhookClient,
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    TextInputBuilder,
    ModalBuilder,
    TextInputStyle
} = require('discord.js');


const toml = require('toml');
const fs = require('fs');
const config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));


const webhookClient = new WebhookClient({
    url: config.support_webhook
});


module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Contact admins for support'),

    async execute(client, interaction) {
        const formMenu = new StringSelectMenuBuilder()
            .setCustomId('formSelect')
            .setPlaceholder('Select support form')
            .addOptions([{
                    label: 'Bot Related',
                    description: 'For reporting bugs and other bot related things.',
                    value: 'bot_related',
                },
                {
                    label: 'General Support',
                    description: 'If the other person tried to scam you or anything else.',
                    value: 'general_support',
                },
                {
                    label: 'Cancel Request',
                    description: 'Send a cancel request to admin',
                    value: 'cancel_request',
                },
            ]);

        const actionRow = new ActionRowBuilder().addComponents(formMenu);

        const embed = new EmbedBuilder()
            .setTitle('Contact Support')
            .setColor('Yellow')
            .setDescription('Please select the type of support you need from the dropdown menu below.');

        await interaction.reply({
            embeds: [embed],
            components: [actionRow],
        });

        const filter = (i) => i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 60000
        });

        collector.on('collect', async (i) => {
            if (i.isStringSelectMenu() && i.customId === 'formSelect') {
                if (i.values[0] === 'bot_related') {
                    const modal = new ModalBuilder()
                        .setCustomId('botRelatedModal')
                        .setTitle('Bot Related Support Form')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                .setCustomId('botRelatedDetails')
                                .setLabel('Describe your issue')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                            )
                        );

                    await i.showModal(modal);

                } else if (i.values[0] === 'general_support') {
                    const modal = new ModalBuilder()
                        .setCustomId('generalSupportModal')
                        .setTitle('General Support Form')
                        .addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder()
                                .setCustomId('generalSupportDetails')
                                .setLabel('Describe your issue')
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                            )
                        );

                    await i.showModal(modal);

                } else if (i.values[0] === 'cancel_request') {
                    const payload = {
                        username: i.user.username,
                        userId: i.user.id,
                        details: 'Cancel request'
                    };

                    let embed = new EmbedBuilder()
                        .setTitle('Cancel Request')
                        .setDescription(payload.details)
                        .setAuthor({
                            name: `${interaction.user.username}`
                        })
                        .setTimestamp()
                        .setColor('Blue')
                        .setFields({
                            name: 'Channel Location',
                            value: `<#${i.channelId}>`
                        });

                    await webhookClient.send({
                        embeds: [embed]
                    });

                    if (!i.replied && !i.deferred) {
                        await i.reply({
                            content: 'Your cancel request has been sent to admin.',
                            ephemeral: true
                        });
                    }
                }
            }
        });

        client.on('interactionCreate', async (interaction) => {
            if (interaction.isModalSubmit()) {

                let details;

                if (interaction.customId === 'botRelatedModal') {
                    details = interaction.fields.getTextInputValue('botRelatedDetails');
                } else if (interaction.customId === 'generalSupportModal') {
                    details = interaction.fields.getTextInputValue('generalSupportDetails');
                }

                const payload = {
                    username: interaction.user.username,
                    userId: interaction.user.id,
                    details: details
                };

                let embed = new EmbedBuilder()
                    .setTitle(interaction.customId)
                    .setAuthor({
                        name: `${payload.username}`
                    })
                    .setDescription(payload.details)
                    .setColor('Blue')
                    .setTimestamp()
                    .setFields({
                        name: 'Channel Location',
                        value: `<#${interaction.channelId}>`
                    });

                await webhookClient.send({
                    embeds: [embed]
                });

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'Your support request has been sent.',
                        ephemeral: true
                    });
                }
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.followUp({
                        content: 'No selection was made. Please try again.',
                        ephemeral: true
                    });
                }
            }
        });
    },
};