const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const toml = require('toml');
const fs = require('fs');
const config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));
const sdk = require('@api/tatumdocs');
const wait = require('wait');
const index = require("../index.js");
const logHandler = require('./logger.js');
const path = require('path');
const util = require('util');
const axios = require('axios');

const { HttpsProxyAgent } = require('https-proxy-agent');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);


const trades_file = path.resolve('./trades.json');


const asyncMutex = require('async-mutex');

let tradesCache = null;
const lock = new asyncMutex.Mutex();

const saveQueue = [];

async function processQueue() {
    while (saveQueue.length > 0) {
        const task = saveQueue.shift();
        try {
            await fs.promises.writeFile(trades_file, JSON.stringify(task.data, null, 2));
        } catch (err) {
            console.error('Error writing to trades.json:', err);
        }
    }
}

async function loadFile() {
    if (tradesCache === null) {
        try {
            const rawData = await fs.promises.readFile(trades_file, 'utf-8');
            tradesCache = JSON.parse(rawData || '{}');
        } catch (err) {
            console.error('Error reading trades.json:', err);
            tradesCache = {};
        }
    }
    return tradesCache;
}

async function saveFile(data) {
    saveQueue.push({ data });
    if (saveQueue.length === 1) {
        processQueue();
    }
}

class Trade {
    constructor(interaction, thread) {
        this.interaction = interaction;
        this.thread = thread;
        this.lastKeyIndex = -1;
        this.sender = null;
        this.receiver = null;
        this.addy = null;
        this.key = null;
        this.receivedAmount = null;
        this.index = null;
        this.counter = 0;
        this.sendMoreCounter = 1;
        this.date = new Date();
        this.attempts = 0;
        this.maxAttempts = 5;
        this.dealAmount = null;
        this.userMap = new Map();
        this.roleEmbed = null;
        this.roleCollector = null;
        this.isProcessing = false;
        this.fee = 0.000013;
        this.ltcaddySent = false;
        this.current_rate = null;
        this.timeoutId = null;
        this.progress = null;
	    this.currency = null;
	    this.servicefee = null;
        this.loadState();
    }

    async saveState() {
        const release = await lock.acquire();
        try {
            const trades = await loadFile();
            trades[this.thread.id] = {
                interactionId: this.interaction.id,
                threadId: this.thread.id,
                LTCaddy: this.addy,
                LTCkey: this.key,
                Access_Key: this.index,
                sender: this.sender,
                receiver: this.receiver,
                status: this.progress,
                dealAmount: this.dealAmount,
                TotalReceived: this.receivedAmount,
                userMap: Array.from(this.userMap.entries()),
                attempts: this.attempts,
                date: this.date
            };
            await saveFile(trades);
        } finally {
            release();
        }
    }

    async loadState() {
        const trades = await loadFile();
        const interactionState = trades[this.thread.id];
        if (
            interactionState &&
            interactionState.interactionId === this.interaction.id &&
            interactionState.threadId === this.thread.id
        ) {
            this.sender = interactionState.sender;
            this.receiver = interactionState.receiver;
            this.dealAmount = interactionState.dealAmount;
            this.userMap = new Map(interactionState.userMap);
        }
    }


    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    startDealTimeout() {
        this.clearDealTimeout();
        this.timeoutId = setTimeout(() => {
            this.continueDeal();
        }, 160000);
    }


    clearDealTimeout() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

















async chooseCurrency(message, sender, receiver) {

    let selectedCurrency = null;
    let senderConfirmed = false;
    let receiverConfirmed = false;

    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('Choose your currency')
        .setDescription('Please select your preferred currency:');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('EUR')
            .setLabel('EUR')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false),
        new ButtonBuilder()
            .setCustomId('USD')
            .setLabel('USD')
            .setStyle(ButtonStyle.Primary)
    );

    const sentMessage = await this.thread.send({ embeds: [embed], components: [row] });

    const filter = i => i.user.id === this.sender || i.user.id === this.receiver;
    const collector = sentMessage.createMessageComponentCollector({ filter, time: 21600000 });

    collector.on('collect', async interaction => {
        if (!selectedCurrency) {
            selectedCurrency = interaction.customId === 'EUR' ? 'EUR' : 'USD';

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('EUR')
                    .setLabel('EUR')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('USD')
                    .setLabel('USD')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );

            await interaction.update({
                embeds: [embed.setDescription(`Both users need to confirm the currency: ${selectedCurrency}`)],
                components: [disabledRow],
            });

            const confirmEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('Confirm your selection')
                .setDescription(`Both users must confirm the selected currency: ${selectedCurrency}`);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm')
                    .setLabel('Confirm')
                    .setStyle(ButtonStyle.Success)
            );

            const confirmMessage = await this.thread.send({ embeds: [confirmEmbed], components: [confirmRow] });

            const confirmCollector = confirmMessage.createMessageComponentCollector({ filter, time: 21600000 });

            confirmCollector.on('collect', async confirmInteraction => {
                if (confirmInteraction.user.id === this.sender) {
                    senderConfirmed = true;
                    await this.thread.send(`<@${this.sender}> confirmed the currency.`);
                } else if (confirmInteraction.user.id === this.receiver) {
                    receiverConfirmed = true;
                    await this.thread.send(`<@${this.receiver}> confirmed the currency.`);
                }

                if (senderConfirmed && receiverConfirmed) {
                    confirmCollector.stop();

                    const disabledConfirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm')
                            .setLabel('Confirm')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true)
                    );

                    await confirmInteraction.update({
                        embeds: [confirmEmbed.setDescription(`Both users confirmed. Currency updated to ${selectedCurrency}.`)],
                        components: [disabledConfirmRow],
                    });

                    this.currency = selectedCurrency;
		    this.colDealAmt();
                } else {
                    await confirmInteraction.deferUpdate();
                }
            });

            confirmCollector.on('end', async collected => {
                if (!(senderConfirmed && receiverConfirmed)) {
                    await confirmMessage.edit({
                        embeds: [confirmEmbed.setDescription('Confirmation timed out or was not completed.')],
                        components: [],
                    });
                }
            });
        } else {
            await interaction.deferUpdate();
        }
    });

    collector.on('end', async collected => {
        if (!selectedCurrency) {
            await sentMessage.edit({
                embeds: [embed.setDescription('No currency was selected.')],
                components: [],
            });
        }
    });
}










    async start(msg) {
        try {
            const embedNew = new EmbedBuilder()
                .setTitle('> Initiate a New Trade')
                .setDescription(
                    '> Let\'s get started! To begin a new trade, please provide the Discord user ID or mention (@username) of your trading partner.'
                )
                .addFields({
                    name: 'Example',
                    value: `<@1237879909578313800> or 1237879909578313800`
                })
                .setColor(0x00BFFF)
                .setFooter({
                    text: 'Enter the user ID or mention'
                })
                .setTimestamp();

            const newHaz = new ButtonBuilder()
                .setCustomId('id_help')
                .setLabel('Help')
                .setEmoji('❔')
                .setStyle(ButtonStyle.Secondary);

            const newCom = new ActionRowBuilder().addComponents(newHaz);

            this.promptMessage = await msg.edit({
                embeds: [embedNew],
                components: [newCom],
                ephemeral: true
            });

            queueMicrotask(() => this.askUserid());
        } catch (error) {
            console.error('Error initiating trade:', error);
        }


        await new Promise(resolve => setTimeout(resolve, 7200000));
const longEmbed = new EmbedBuilder()
	.setColor(0xFF0000)
	.setTitle('Warning')
	.setDescription('This trade will be closed and deleted in 4 hours from now. If there is any reason this trade should not be closed in 4 hours please contact support fast using /help.')
	.setTimestamp()

await this.thread.send({ embeds: [longEmbed] });





        await new Promise(resolve => setTimeout(resolve, 21600000));
        await this.thread.setLocked(true);
        await this.thread.setName('Closed!');
        await this.thread.delete().catch(error => console.log('Error deleting thread:', error));



    }


    async askUserid(retryCount = 0) {
        const message_filter = response => response.author.id === this.interaction.user.id;
        const messageCollector = this.thread.createMessageCollector({
            filter: message_filter,
            max: 1,
            time: 60000 * 5
        });

        messageCollector.on('collect', async message => {
            let userId;
            const mentionedUsers = message.mentions.users;

            if (mentionedUsers.size > 0) {
                userId = mentionedUsers.first().id;
            } else {
                const userIdOrMention = message.content.trim();
                if (userIdOrMention.startsWith('<@') && userIdOrMention.endsWith('>')) {
                    userId = userIdOrMention.slice(2, -1);
                    if (userId.startsWith('!')) userId = userId.slice(1);
                } else {
                    userId = userIdOrMention;
                }
            }

            if (!userId.match(/^\d{17,19}$/)) {
                await message.reply({
                    content: '> Invalid user ID format. Please provide a valid user ID or mention.',
                    ephemeral: true
                });
                await message.delete().catch(error => console.error('Error deleting message:', error));

                if (retryCount < 3) {
                    return this.askUserid(retryCount + 1);
                } else {
                    await this.handleMaxRetries(message);
                }
                return;
            }

            try {
                const guild = await index.client.guilds.cache.get(config.guildID);
                if (!guild) {
                    await message.reply('Guild not found.');
                    return;
                }

                const user = await guild.members.fetch(userId);

                if (user.id === this.interaction.user.id) {
                    await message.reply({
                        content: '> You cannot add yourself to the trade.',
                        ephemeral: true
                    });
                    await message.delete().catch(error => console.error('Error deleting message:', error));
                    return this.askUserid(retryCount);
                }

                await this.processTrade(user);

            } catch (error) {
                console.error('Error in collecting user ID:', error);
                await this.handleFetchError(error, message, retryCount);
            }
        });

        messageCollector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                await this.handleTimeout(message);
            }
        });
    }

    async handleMaxRetries(message) {
        await message.reply('You have exhausted the attempts to add a user to this ticket. Please create a new ticket.');
        await this.closeThread();
    }

    async handleFetchError(error, message, retryCount) {
        let errorMessage = error.code === 10013 ?
            '> User not found in the server. Please ensure the ID is correct and the user is in the guild.' :
            '> Failed to fetch member. Please try again later.';

        const msg = await message.reply({
            content: errorMessage,
            ephemeral: true
        });

        setTimeout(async () => {
            await message.delete().catch(error => console.error('Error deleting message:', error));
            await msg.delete().catch(error => console.error('Error deleting message:', error));
            if (retryCount < 3) {
                return this.askUserid(retryCount + 1);
            } else {
                await this.handleMaxRetries(message);
            }
        }, 1500);
    }

    async handleTimeout() {
        await this.thread.send({
            embeds: [new EmbedBuilder().setTitle('> User failed to add a user. Trade process cancelled.').setColor('Red')],
            ephemeral: true
        });
        await this.closeThread();
    }

    async processTrade(user) {
        this.index = await this.generateUniqueNumber();
        this.progress = 'Generated Thread Key';

        const xembed = new EmbedBuilder()
            .setTitle('🚀 Welcome to Fusion MM')
            .setDescription(`Fusion MM is a secure platform for conducting transactions with confidence. We provide:
                - Neutral third-party escrow service
                - Protection for buyers and sellers
                - Seamless and streamlined experience`)
            .addFields(
                { name: '⚠️ Important Instructions', value: '- Do not release funds until you have received the product or service as described.\n- If the item is not as described, contact our support team immediately.' },
                { name: '🕰️ Trade Details', value: `**Date:** <t:${Math.floor(Date.now() / 1000)}:F>\n**Trade Owner:** <@${this.interaction.user.id}>` },
                { name: '🔑 Key', value: `||${this.index}||` }
            )
            .setColor(0x00BFFF)
            .setTimestamp()
            .setFooter({ text: '♻ Fusion MM - Secure Transactions' });

        await Promise.all([
            this.thread.setName(`Trade with @${this.interaction.user.username} & @${user.user.username}`),
            this.thread.members.add(user),
            this.promptMessage.delete().catch(error => console.error('Error deleting message:', error)),
            this.thread.send({
                embeds: [xembed],
                content: `||<@${this.interaction.user.id}>&<@${user.id}>||`
            }),
            this.userMap.set(user.id, this.interaction.user.id),
            this.progress = `Started Trade With ${this.interaction.user.id} & ${user.id}`,
            this.saveState(),
            this.initRoleSel()
        ]);
    }

    async closeThread() {
        await this.thread.setLocked(true);
        await this.thread.setName('Closed!');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.thread.delete().catch(error => console.log('Error deleting thread:', error));
    }



    async initRoleSel() {
        try {
            const selectEmbed = new EmbedBuilder()
                .setTitle('>  Verify Trade Details')
                .addFields({
                    name: '👤 Sender (LTC sender)',
                    value: this.sender ? `<@${this.sender}>` : 'None selected',
                    inline: true
                }, {
                    name: '👤 Receiver (Receiver)',
                    value: this.receiver ? `<@${this.receiver}>` : 'None selected',
                    inline: true
                }, {
                    name: '⚠️ Important',
                    value: `\`\`\`
- Ensure the trade details are correct before proceeding.
- If any information is incorrect, contact support immediately.\`\`\``
                })
                .setColor(0x00BFFF)
                .setTimestamp()
                .setFooter({
                    text: '♻ Fusion MM - ✔ Verify Trade Details'
                });

            const roleRow = this.createRoleRow();

            this.roleEmbed = await this.thread.send({
                embeds: [selectEmbed],
                components: [roleRow],
                ephemeral: true
            });
            await this.saveState();

            await this.startRoleCol();
        } catch (err) {
            console.error('Error in initRoleSel():', err);
        }
    }




    async startRoleCol() {
        const filter = (btnInteract) => {
            const interactionUserId = this.userMap.get(btnInteract.user.id);
            return btnInteract.user.id === this.interaction.user.id || interactionUserId === this.interaction.user.id;
        };

        this.roleCollector = this.thread.createMessageComponentCollector({
            filter,
            time: 60000 * 15
        });

        this.roleCollector.on('collect', async (roleInteraction) => {
            try {
                await roleInteraction.deferUpdate();

                switch (roleInteraction.customId) {
                    case 'cancelparties':
                        if (this.sender == null && this.receiver == null) return;
                        this.sender = null;
                        this.receiver = null;
                        await Promise.all([
                            this.saveState(),
                            roleInteraction.channel.send({
                                content: `> Roles reset by ${roleInteraction.user}. Please select roles again.`
                            }),
                            this.roleEmbed.delete().catch(err => console.error('Error deleting role embed:', err))
                        ]);
                        this.roleCollector.stop();
                        return this.initRoleSel();

                    case 'selectSender':
                        await this.handleRoleSelection(roleInteraction, 'sender');
                        break;

                    case 'selectReceiver':
                        await this.handleRoleSelection(roleInteraction, 'receiver');
                        break;

                    default:
                        return;
                }

                await this.updateRoleEmbed();

                if (this.sender && this.receiver) {
                    this.roleCollector.stop();
                    await this.saveState();
                    await this.confirmRoles();
                }
            } catch (error) {
                console.error('Error processing role interaction:', error);
            }
        });

        this.roleCollector.on('end', async (collected, reason) => {
            if (collected.size < 2 && reason === 'time') {

                try {
                    await this.thread.send({
                        content: '> Trade process cancelled. Parties did not select roles in time.',
                        ephemeral: true
                    });
                    await this.thread.setName('Closed!')
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    this.thread.delete().catch(error => console.log('Error deleting message:', error));
                } catch (err) {
                    console.error('Error ending trade process:', err);
                }
            }

        })
    }



    handleRoleSelection = async (roleInteraction, role) => {
        if (this[role] === roleInteraction.user.id) {
            await roleInteraction.followUp({
                content: `You are already assigned as the ${role}.`,
                ephemeral: true
            });
        } else if (this[role === 'sender' ? 'receiver' : 'sender'] === roleInteraction.user.id) {
            await roleInteraction.followUp({
                content: `You are already the ${role === 'sender' ? 'receiver' : 'sender'}, so you cannot be assigned as the ${role}.`,
                ephemeral: true
            });
        } else if (this[role]) {
            await roleInteraction.followUp({
                content: `The ${role} role is already occupied. Please try again later.`,
                ephemeral: true
            });
        } else {
            this[role] = roleInteraction.user.id;
        }
    };




    async confirmRoles() {
        const confirm_row = this.createConfirmationRow();

        if (this.roleEmbed) {
            await this.roleEmbed.edit({
                components: [confirm_row]
            });
        }

        const filter = btnInteract => [this.sender, this.receiver].includes(btnInteract.user.id);
        const roleCollector = this.thread.createMessageComponentCollector({
            filter,
            time: 60000 * 15
        });

        const roles_Sender = new Set();
        const roles_Receiver = new Set();

        roleCollector.on('collect', async (confirmAction) => {
            try {
                await confirmAction.deferUpdate();

                const userId = confirmAction.user.id;

                switch (confirmAction.customId) {
                    case 'confirmRolesx':
                        if (roles_Sender.has(userId) || roles_Receiver.has(userId)) {
                            if (!confirmAction.replied) {
                                return;
                            } else {
                                await confirmAction.followUp({
                                    content: 'You have already confirmed the deal.',
                                    ephemeral: true
                                });
                            }
                            return;
                        }

                        if (userId === this.sender) {
                            roles_Sender.add(this.sender);
                            await this.thread.send({
                                content: `> <@${this.sender}> Authorized as Sender`,
                                ephemeral: true
                            });
                        }
                        if (userId === this.receiver) {
                            roles_Receiver.add(this.receiver);
                            await this.thread.send({
                                content: `> <@${this.receiver}> Authorized as Receiver`,
                                ephemeral: true
                            });
                        }

                        if (roles_Sender.has(this.sender) && roles_Receiver.has(this.receiver) && !this.done) {
                            this.done = true;
                            await this.roleEmbed.edit({
                                components: []
                            });
                            await Promise.all([
                                this.saveState(), // Save state after both roles are confirmed
                                this.chooseCurrency(), // Start currency choosing
                            ]);
                            roleCollector.stop();
                        }
                        break;

                    case 'resetRoles':
                        if (this.done) return;
                        this.done = true;
                        this.sender = null;
                        this.receiver = null;
                        roles_Sender.clear();
                        roles_Receiver.clear();
                        await Promise.all([
                            this.saveState(),
                            this.roleEmbed.delete().catch(error => console.error('Error deleting message:', error)),
                            confirmAction.channel.send({
                                content: `> Roles reset by ${confirmAction.user}. Please select roles again.`
                            })
                        ]);
                        roleCollector.stop();
                        this.initRoleSel();
                        break;

                    case 'cancelRoles':
                        this.disableButtons(this.roleEmbed)
                        if (this.done) return;
                        this.done = true;
                        const unixTime = Math.floor(Date.now() / 1000) + 15;
                        const cancelEmbed = new EmbedBuilder()
                            .setTitle('⚠ Cancel Trade')
                            .setDescription(`Click the button below to reopen the ticket. The trade will be cancelled if you don't respond within <t:${unixTime}:R>`)
                            .setColor(0xFF3131);
                        const reopenButton = new ButtonBuilder()
                            .setCustomId('reopenTicket')
                            .setLabel(`Reopen`)
                            .setStyle(ButtonStyle.Success);
                        const cancelRow = new ActionRowBuilder().addComponents(reopenButton);
                        const cancelMessage = await confirmAction.channel.send({
                            embeds: [cancelEmbed],
                            components: [cancelRow]
                        });
                        const reopenFilter = (btnInteract) => btnInteract.user.id === confirmAction.user.id && btnInteract.customId === 'reopenTicket';
                        const role_col = cancelMessage.createMessageComponentCollector({
                            filter: reopenFilter,
                            time: 15000,
                            max: 1
                        });

                        role_col.on('collect', async () => {
                            await cancelMessage.delete().catch(error => console.error('Error deleting message:', error));;
                            this.done = false;
                            this.enableButtons(this.roleEmbed)

                        });

                        role_col.on('end', async (collected, reason) => {
                            if (reason === 'time' && collected.size < 1) {

                                await confirmAction.followUp({
                                    content: 'One or More People did not select the party',
                                    ephemeral: true
                                });
                                await this.thread.setName('Closed!')
                                await this.thread.delete().catch(error => console.error('Error deleting message:', error));;
                                roleCollector.stop();

                            }
                        });
                        break;

                    default:
                        break;
                }
            } catch (err) {
                console.error('Error handling button click:', err);
            } finally {
                this.isProcessing = false;
            }
        });

        roleCollector.on('end', async (collected, reason) => {
            this.done = false;
            if (reason === 'time' && collected.size < 2) {

                await this.thread.send({
                    content: '> Roles not confirmed . Trade process cancelled.'
                });
                await this.thread.setName('Closed!')
                await this.thread.delete().catch(error => console.log('Error deleting message:', error));



            }
        });
    }




    async colDealAmt() {
        const EnterAmount = new EmbedBuilder()
            .setTitle('💰 Enter Deal Amount')
            .setDescription('> Enter the amount to be sent for the trade.')
            .setColor(0x00FF00)
            .setFooter({
                text: '♻ Fusion MM '
            });

        await this.thread.send({
            content: `<@${this.sender}>`,
            embeds: [EnterAmount],
            ephemeral: true
        });

        const message_filter = response => response.author.id === this.sender;
        const amount_collector = this.thread.createMessageCollector({
            filter: message_filter,
            time: 60000 * 30
        });

        amount_collector.on('collect', async message => {
            const rawContent = message.content.replace(/\$/g, '').trim();
            const amountRegex = /^\d+(\.\d+)?$/;

            if (!amountRegex.test(rawContent)) {
                return;
            }

            
            const amount = parseFloat(rawContent);



            //let amount1 = 0;

            //if (this.currency === "EUR") {
                //const endpoint1 = `https://min-api.cryptocompare.com/data/price?fsym=EUR&tsyms=USD`;
                //const response1 = await axios.get(endpoint1)
                //const data1 = response1.data.USD;
                //amount1 = parseFloat(rawContent * data1)
            //} else {
                //amount1 = parseFloat(rawContent);
            //}

            
            //const amount = parseFloat(amount1);
            

            if (amount <= 0.04) {
                await this.thread.send({
                    content: '> Invalid amount entered. Please enter a valid deal amount.',
                    ephemeral: true
                });
                return;
            }

            this.dealAmount = amount;
            await Promise.all([
                message.react('✅'),
                this.saveState(),
            ]);

            this.ready();
            this.confirmDealAmount();
            amount_collector.stop();
        });

        amount_collector.on('end', async (collected, reason) => {
            this.isProcessing = false;

            if (reason == 'time' && collected.size < 1) {
                await this.thread.send({
                    embeds: [new EmbedBuilder().setTitle('> No amount provided. Trade process cancelled.').setColor('Red')],
                    ephemeral: true
                });
                await this.thread.setLocked(true)
                await this.thread.setName('Closed!')
                await this.thread.delete().catch(error => console.log('Error deleting message:', error));

            }

        });
    }




    async confirmDealAmount() {

        const confirm_embed = new EmbedBuilder()
            .setTitle('> Confirm Deal Details ')
            .setDescription(`**Deal Amount: ${this.dealAmount} ${this.currency}**`)
            .setColor(0x00b300)
            .setFooter({
                text: 'Deal Confirmation - ♻ Fusion MM'
            })
            .setTimestamp();

        this.embed = await this.thread.send({
            content: `||<@${this.sender}><@${this.receiver}>||`,
            embeds: [confirm_embed],
            components: [this.createDealConfirmationRow()]
        });

        const filter = (btnInteract) => [this.sender, this.receiver].includes(btnInteract.user.id);
        const amount_collector = this.thread.createMessageComponentCollector({
            filter,
            time: 60000 * 40
        });

        const senderConfirmed = new Set();
        const receiverConfirmed = new Set();

        amount_collector.on('collect', async (confirmAction) => {
            const userId = confirmAction.user.id;


            try {
                switch (confirmAction.customId) {
                    case 'confirmDeal':
                        if (senderConfirmed.has(userId) || receiverConfirmed.has(userId)) {
                            return;
                        }

                        if (userId === this.sender && !senderConfirmed.has(this.sender)) {
                            senderConfirmed.add(this.sender);
                            await this.thread.send({
                                content: `> <@${this.sender}> Confirmed Trade Amount`
                            });
                        } else if (userId === this.receiver && !receiverConfirmed.has(this.receiver)) {
                            receiverConfirmed.add(this.receiver);
                            await this.thread.send({
                                content: `> <@${this.receiver}> Confirmed Trade Amount`
                            });
                        }

                        if (senderConfirmed.has(this.sender) && receiverConfirmed.has(this.receiver) && !this.ltcaddySent) {
                            this.ltcaddySent = true;
                            this.disableButtons(this.embed)
                            await this.sendLTCaddy(confirmAction);
                            await this.embed.edit({
                                components: []
                            });
                            amount_collector.stop();
                        }
                        break;

                    case 'resetDeal':
                        senderConfirmed.clear();
                        receiverConfirmed.clear();
                        this.resetDeal(confirmAction.user);
                        amount_collector.stop({
                            reason: 'reset'
                        });
                        break;

                    case 'cancelDeal':
                        await this.cancelDeal(confirmAction.user);
                        amount_collector.stop({
                            reason: 'closed'
                        });
                        break;

                    default:
                        break;
                }
            } catch (error) {
                console.error('Error in confirmDealAmount:', error);
            }
        });

        amount_collector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size < 2) {

                this.handleTimeout();
            }
        });
    }

    async cancelDeal(user) {
        try {
            await Promise.all([
                this.thread.send({
                    content: `> ${user} Canceled The Deal`
                }),
                this.thread.setLocked(true),
                await this.thread.setName('Closed!'),
                await new Promise(resolve => setTimeout(resolve, 6000)),
                this.thread.delete().catch(error => console.error('Error deleting message:', error)),
            ]);
        } catch (error) {
            console.error('Error in cancelDeal:', error);
        }
    }
    async handleTimeout() {
        try {
            await Promise.all([
                this.thread.send({
                    content: '> Deal amount not fully confirmed. Trade process cancelled.',
                    ephemeral: true
                }),
                this.thread.setLocked(true),
                this.embed.delete().catch(error => console.error('Error deleting message:', error)),
            ]);
        } catch (error) {
            console.error('Error in handleTimeout:', error);
        }
    }

    async resetDeal(user) {
        try {
            this.dealAmount = null;
            this.ltcaddySent = false

            await Promise.all([
                this.embed.delete().catch(error => console.error('Error deleting message:', error)),
                this.thread.send({
                    content: `> ${user} Reset Deal Amount`
                }),
                this.saveState(),
            ]);

            setTimeout(() => this.colDealAmt(), 0); // Restart deal collection asynchronously
        } catch (error) {
            console.error('Error in resetDeal:', error);
        }
    }




    createRoleRow() {
        const senderButton = new ButtonBuilder()
            .setCustomId('selectSender')
            .setLabel('Choose Sender')
            .setEmoji('📤')
            .setStyle(ButtonStyle.Secondary);

        const receiverButton = new ButtonBuilder()
            .setCustomId('selectReceiver')
            .setLabel('Select Receiver')
            .setEmoji('📥')
            .setStyle(ButtonStyle.Secondary);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancelparties')
            .setLabel('Reset')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(senderButton, receiverButton, cancelButton);

        return row;
    }



    async updateRoleEmbed() {
        const selectEmbed = new EmbedBuilder()
            .setTitle('>  Verify Trade Details')
            .addFields({
                name: '👤 Sender (LTC Sender)',
                value: this.sender ? `<@${this.sender}>` : 'None selected',
                inline: true
            }, {
                name: '👤 Receiver (Receiver)',
                value: this.receiver ? `<@${this.receiver}>` : 'None selected',
                inline: true
            }, {
                name: '⚠️ Important',
                value: `\`\`\`
- Ensure the trade details are correct before proceeding.
- If any information is incorrect, contact support immediately.\`\`\``
            })
            .setColor(0x00BFFF)
            .setTimestamp()
            .setFooter({
                text: '♻ Fusion MM - ✔ Verify Trade Details'
            });;

        this.roleEmbed.edit({
            embeds: [selectEmbed]
        });
    }


    createConfirmationRow() {
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirmRolesx')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success);

        const resetButton = new ButtonBuilder()
            .setCustomId('resetRoles')
            .setLabel('Reset')
            .setStyle(ButtonStyle.Secondary);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancelRoles')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(confirmButton, resetButton, cancelButton);

        return row;
    }

    createDealConfirmationRow() {
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirmDeal')
            .setLabel('Confirm Deal')
            .setStyle(ButtonStyle.Success);

        const resetButton = new ButtonBuilder()
            .setCustomId('resetDeal')
            .setLabel('Reset')
            .setStyle(ButtonStyle.Secondary);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancelDeal')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(confirmButton, resetButton, cancelButton);

        return row;
    }


    async ready() {
        try {
            const [ltcAmount, , genLTCaddy, genLTCkey] = await Promise.all([
                this.UsdToLtc(this.dealAmount).catch(err => {
                    console.error('Error converting ${this.currency} to LTC:', err);
                    return null;
                }),
                this.generateLTCaddy().catch(err => {
                    console.error('Error generating LTC address:', err);
                    return null;
                }),
                this.generateLTCkey().catch(err => {
                    console.error('Error generating LTC key:', err);
                    return null;
                })
            ]);

            if (ltcAmount !== null && genLTCaddy !== null && genLTCkey !== null) {
                this.ltcAmount = parseFloat(ltcAmount) + parseFloat(this.fee);
                this.ltc_to_receive = this.ltcAmount.toFixed(8);
                this.genLTCaddy = genLTCaddy;
                this.genLTCkey = genLTCkey;
                this.progress = `Genearted Ltc_key ${this.key}`
                await this.saveState()
            } else {
                throw new Error('Error in one of the promises');
            }

        } catch (error) {
            console.error('Error in ready:', error);
        }
    }



    async sendLTCaddy(data) {


        try {

            while (!this.addy || !this.key || !this.ltc_to_receive) {
                console.log('> Waiting For Resources To Load');
                if (!this.addy) {
                    console.log('this.addy is not available');
                }
                if (!this.key) {
                    console.log('this.key is not available');
                }
                if (!this.ltc_to_receive) {
                    console.log('this.ltc_to_receive is not available');
                }
                await this.delay(1000);
            }


            setTimeout(() => {
                this.waitForTransaction();
            }, 10000);

            const ltcEmbed = new EmbedBuilder()
                .setTitle('🧾 Payment Invoice')
                .setColor(0x00BFFF)
                .setDescription(` <@${this.sender}> Please send the required LTC to the address below to complete the transaction.`)
                .addFields({
                    name: '📥 Address',
                    value: `\`\`\`${this.addy}\`\`\``,
                    inline: false
                }, {
                    name: '💰 LTC',
                    value: `\`\`\`${this.ltc_to_receive}\`\`\``,
                    inline: true
                }, {
                    name: `💵 ${this.currency}`,
                    value: `\`\`\`${this.dealAmount}\`\`\``,
                    inline: true
                })
                .setTimestamp()
                .setFooter({
                    text: '♻ Fusion MM - Payment Invoice'
                });

            const pasteButton = new ButtonBuilder()
                .setCustomId(`paste|${this.addy}|${this.ltc_to_receive}`)
                .setLabel('Paste')
                .setEmoji(`📃`)
                .setStyle(ButtonStyle.Secondary);

            const qrButton = new ButtonBuilder()
                .setCustomId(`qr|${this.addy}|${this.ltc_to_receive}`)
                .setLabel('Show QR')
                .setEmoji(`📃`)
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(pasteButton, qrButton);

            const cha = data.channel;
            this.msg = await cha.send({
                components: [row],
                content: `||<@${this.sender}>||`,
                embeds: [ltcEmbed]
            });



        } catch (error) {
            console.error('Error in sendLTCaddy:', error);
        }

    }




    async generateUniqueNumber() {
        const date = new Date();
        const day = date.getDate();
        const year = date.getFullYear();
        const rand = Math.floor(Math.random() * 100);
        const rand2 = Math.floor(Math.random() * 10);
        const sec = String(date.getSeconds()).padStart(3, '0');
        const uniqueNumber = `${day}${sec}${rand2}${rand}`;
        this.index = parseInt(uniqueNumber);
        await this.saveState()
        return this.index
    }

    async generateLTCaddy() {
        let retryCount = 0;
        
        while (retryCount < 3) {
            try {
                sdk.auth(config.apikey);
                let key = await sdk.ltcGenerateAddress({
                    xpub: config.xpub,
                    index: await parseInt(this.index)
                });
                this.addy = key.data.address;
                await this.saveState();
                return key.data.address;
            } catch (err) {
                console.error('Error generating LTC address:', err);
                retryCount++;
                if (retryCount < 3) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds delay
                } else {
                    console.error('> Failed to generate LTC address twice in a row. Closing thread.');
                    throw err;
                }
            }
        }
    }
    


    async generateLTCkey() {
        let retryCount = 0;
    
        while (retryCount < 3) {
            try {
                sdk.auth(config.apikey);
                let keydata = await sdk.ltcGenerateAddressPrivateKey({
                    index: parseInt(this.index),
                    mnemonic: config.mnemonic
                });
                this.key = keydata.data.key;
                await this.saveState();
    
                if (this.addy) return keydata.data.key;
                
                await this.delay(2000);
                retryCount++;
            } catch (err) {
                console.error('Error generating LTC key:', err);
                retryCount++;
                if (retryCount === 3) {
                    console.error('Failed to generate LTC key twice in a row. Closing thread.');
                    throw err;
                }
            }
        }
    
        console.error('Failed to generate LTC key after retries. Closing thread.');
        throw new Error('Failed to generate LTC key after retries.');
    }

    

    async getNextApiKey() {
        const apiTokens = config.apiToken;

        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * apiTokens.length);
        } while (newIndex === this.lastKeyIndex);

        this.lastKeyIndex = newIndex;
        return apiTokens[newIndex];
    }


    async checkbalance(address) {
        const maxAttempts = 3;
        let attempt = 0;

        while (attempt < maxAttempts) {
            try {
                const apiKey = await this.getNextApiKey();
                //const axiosWithProxy = await this.AxiosInstance();
                const endpoint = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance?token=${apiKey}`;
                const response = await axios.get(endpoint);
                const data = response.data;
                const bal1 = data.total_received || 0;
                const unbal = data.unconfirmed_balance || 0;

                const ltcbal = await this.satoshisToLtc(bal1 + unbal);
                return parseFloat(ltcbal);
            } catch (err) {
                console.error(`Attempt ${attempt + 1} failed: Error retrieving LTC balance - ${err.message}`);
                if (attempt === maxAttempts - 1) {
                    console.error(`Max attempts reached. Unable to retrieve balance for address ${address}`);
                    throw err;
                } else {
                    attempt++;
                }
            }
        }
    }

    async sendLTC(address) {
        try {
            let bal1;
            try {
                bal1 = await this.checkbalance(this.addy);
                console.log(`LTC Bal From Addy  : ${this.addy}  :`, bal1);
            } catch (err) {
                console.error('Error checking balance:', err);
                throw new Error('Failed to check balance');
            }

            const fee = parseFloat(this.fee);
            if (isNaN(fee) || fee < 0) {
                throw new Error("Invalid fee value. Fee should be a non-negative number.");
            }
	    const bal = bal1 * 0.50;
            const finalBalance = bal - fee;
            const formattedFinalBalance = parseFloat(finalBalance).toFixed(8);
            console.log(`LTC Releaseing For : ${address}  :`, finalBalance);

            try {
                await sdk.auth(config.apikey);
            } catch (err) {
                console.error('Error during SDK authentication:', err);
                throw new Error('SDK authentication failed');
            }


            let hax;
            try {
                hax = await sdk.ltcTransferBlockchain({
                    fromAddress: [{
                        address: this.addy.toString(),
                        privateKey: this.key.toString()
                    }],
                    fee: fee.toString(),
                    changeAddress: address.toString(),
                    to: [{
                        address: address.toString(),
			//value: finalBalance
                        value: parseFloat(formattedFinalBalance)
                    }]
                });

                this.txId = hax.data.txId;
                const fundReleasedEmbed = new EmbedBuilder()
                    .setTitle('🟢 Funds Released')
                    .setDescription(
                        `The funds have been released to the following LTC address:\n\n\`${address}\``
                    )
                    .addFields({
                        name: 'Transaction ID',
                        value: `[${this.txId}](https://live.blockcypher.com/ltc/tx/${this.txId})`,
                        inline: true
                    }, {
                        name: 'Timestamp',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                        inline: true
                    })
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({
                        text: '♻ Fusion MM - Trade Completed'
                    });

                await this.thread.send({
                    embeds: [fundReleasedEmbed]
                });
                this.progress = `Releasesd Funds at ${address}`
                await this.thread.sendTyping();
                this.data = {
                    sender: this.sender,
                    receiver: this.receiver,
                    amount: this.usd,
                    txid: this.txId,
                    channel: this.thread
                }

                // Auto Transcript and Auto Payment Logs
                logHandler('logs', this.data);
                logHandler('transcript', this.data);


                // Auto Role
                let users = [this.sender, this.receiver]
                const guild = await index.client.guilds.cache.get(config.guildID);

                if (config.client_role) {
                    for (const id of users) {
                        const user = await guild.members.fetch(id);
                        const role = guild.roles.cache.get(config.client_role);
                        await user.roles.add(role).catch((e) => console.log('Role Adding Error :  ', e));
                    }
                }



                const button = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('transcript')
                        .setLabel('Transcript')
                        .setStyle(ButtonStyle.Success)
                );
                const transcript = new EmbedBuilder()
                    .setTitle('🎫 Transcript Manager')
                    .setDescription(`> Would you like us to send you a transcript of this deal?`)
                    .setColor(0x00BFFF)

                await this.thread.send({
                    components: [button],
                    embeds: [transcript]
                })

                await this.thread.sendTyping();
                await new Promise(resolve => setTimeout(resolve, 6000));

                await this.thread.send({
                    content: '> ⭐ Please describe your experience in <#1343164740909662239>'
                });
                await new Promise(resolve => setTimeout(resolve, 86400000));
                this.thread.delete().catch(error => console.log('Error deleting message:', error));

            } catch (err) {
                console.error('Error sending LTC:', err);
                throw new Error('Failed to send LTC');
            }
        } catch (err) {
            console.error('Error in sendLTC function:', err);
            await this.thread.send({
                content: `> ⚠ Error: ${err.message} \n > Please Reach Out Support ! \n > Use-case : /help`
            });
        }
    }



    async checkTransactions() {
        const apiKey = await this.getNextApiKey();
        //const axiosWithProxy = await this.AxiosInstance();

        const endpoint = `https://api.blockcypher.com/v1/ltc/main/addrs/${this.addy}/?token=${apiKey}`;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await axios.get(endpoint);
                if (response.status === 200 && response.data) {
                    return response.data;
                } else {
                    console.error(`Attempt ${attempt} - Invalid response status: ${response.status}`);
                }
            } catch (error) {
                console.error(`Attempt ${attempt} - Error fetching transactions: ${error.message}`);
                if (attempt < 3) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await this.delay(delay);
                } else {
                    return null;
                }
            }
        }
    }


    async waitForTransaction() {
        let txidFound = false;
        this.counter = 0;

        while (!txidFound) {
            try {
                const response = await this.checkTransactions();

                if (response) {
                    const n_tx = parseInt(response.n_tx, 10);
                    const total_received = response.total_received || 0;
                    const unconfirmed_balance = response.unconfirmed_balance || 0;
                    const unconfirmed_txrefs = response.unconfirmed_txrefs || [];

                    const isNewTransaction = unconfirmed_txrefs.length >= this.sendMoreCounter;
                    const total = await this.satoshisToLtc(total_received + unconfirmed_balance);
                    if (parseFloat(total) > parseFloat(this.receivedAmount) || isNewTransaction) {
                        txidFound = true;
                        let totalReceivedInLtc = await this.satoshisToLtc(total_received + unconfirmed_balance);
                        //let totalReceivedInLtc = unconfirmed_balance
                        this.receivedAmount = parseFloat(totalReceivedInLtc).toFixed(8);
                        let usdrec = await this.ltcToUsd(this.receivedAmount);
			            //this.usd = this.receivedAmount * this.usdbaldata;
                        this.usd = parseFloat(usdrec).toFixed(4);
                        //this.usd = parseFloat(usdBalance).toFixed(4);

                        //if (Math.abs(this.usd - this.dealAmount) < 0.001) {
                            //this.usd = this.dealAmount.toFixed(4);
                        //}
                        this.progress = `Money Received ${this.usd} ${this.currency}`

                        if (this.rescan) {
                            this.rescan.delete().catch(error => console.error('Error deleting message:', error));
                        }

                        if (parseFloat(this.receivedAmount) >= parseFloat(this.ltc_to_receive) || this.dealAmount <= this.usd) {
                            if (this.message != null) {
                                this.message.delete().catch(error => console.error('Error deleting message:', error));
                            }

                            this.fetchTaxID();
                        } else {
                            return this.incuff();
                        }
                    }
                }
            } catch (error) {
                console.error(`Error checking transactions: ${error.message}`);
            }

            if (!txidFound) {
                if (this.counter >= 5) {
                    txidFound = true;
                    const message = await this.thread.send({
                        content: `<@${this.sender}>`,
                        embeds: [new EmbedBuilder().setDescription(`> ⚠ Transaction Not Detected .  What would you like to do?`).setColor(0xFFFF33)],
                        components: [{
                            type: 1,
                            components: [{
                                type: 2,
                                label: 'Re-scan',
                                emoji: '🔃',
                                style: 2,
                                custom_id: 'rescan'
                            },
                            {
                                type: 2,
                                label: 'cancel',
                                style: 4,
                                custom_id: 'close_trade'
                            }]
                        }]
                    });

                    try {
                        const interaction = await message.awaitMessageComponent({
                            time: 60000 * 80,
                            filter: (interaction) => (interaction.customId === 'rescan' || interaction.customId === 'close_trade') && interaction.user.id === this.sender
                        });

                        if (interaction.customId === 'rescan') {
                            this.counter = 0;
                            txidFound = false;
                            this.rescan = await interaction.update({
                                content: `> 🔃 <@${this.sender}> Requested Rescan`,
                                embeds: [],
                                components: []
                            });
                        } else if (interaction.customId === 'close_trade') {
                            if (this.receivedAmount > 0) {
                                txidFound = true;
                                this.handleCancel(interaction);
                            } else {
                                this.thread.setLocked(true);
                                this.thread.setName('Closed!');
                                this.thread.send({
                                    content: `> ⛔ <@${this.sender}> Did not respond in time , Closing the trade`
                                });
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                this.thread.delete().catch(error => console.log('Error deleting message:', error)); return;
                            }
                        }
                    } catch (error) {
                        if (error.name === 'InteractionCollectorError') {
                            this.thread.send({
                                content: `> ⛔ <@${this.sender}> Did not respond in time , Closing the trade`
                            });
                            this.thread.setLocked(true);
                            this.thread.setName('Closed!');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            this.thread.delete().catch(error => console.log('Error deleting message:', error)); return;
                        } else {
                            this.thread.send({
                                content: `> ⛔ <@${this.sender}> Did not respond in time, Closing the trade`
                            });
                            this.thread.setLocked(true);
                            this.thread.setName('Closed!');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            this.thread.delete().catch(error => console.log('Error deleting message:', error)); return;
                        }
                    }

                    this.counter = 0;
                } else {
                    this.counter++;

                    const getRandomJitter = () => Math.floor(Math.random() * 1000) + 1500;
                    let time = getRandomJitter() + parseInt(config.timeout);
                    await new Promise(resolve => setTimeout(resolve, time));

                }
            }
        }
    }


    async incuff() {

        const newE = new EmbedBuilder()
            .setTitle('⚠️ Amount Mismatch')
            .setColor(0xFF0000)
            .setDescription(`<@${this.sender}>, the amount received (${this.receivedAmount} LTC) is less than the expected amount (${this.ltc_to_receive} LTC).`)
            .addFields({
                name: 'Expected Amount',
                value: `\`${this.dealAmount} ${this.currency}\``,
                inline: true
            }, {
                name: 'Received Amount',
                value: `\`${this.usd} {this.currency}\``,
                inline: true
            })
            .setFooter({
                text: 'Please send the remaining amount to complete the trade.'
            });

        const options_row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('addmore')
                    .setLabel('Send More')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('continuex')
                    .setLabel('Continue')
                    .setStyle(ButtonStyle.Secondary)
            );
        try {

            this.message = await this.thread.send({
                content: `||<@${this.sender}><@${this.receiver}>||`,
                embeds: [newE],
                components: [options_row]
            });
            const filter = (interaction) => interaction.user.id === this.sender && ['addmore', 'continuex'].includes(interaction.customId);
            const newCollector = this.message.createMessageComponentCollector({
                filter,
                time: 604800000
            });

            newCollector.on('collect', async (interaction) => {
                if (interaction.customId === 'addmore') {
                    this.sendMoreCounter++;

                    await this.message.edit({
                        content: `> 🟢 ${interaction.user} Decided To Send More Funds!`,
                        components: [],
                        embeds: []
                    });

                    if (!interaction.replied) {
                        await interaction.reply({
                            content: '> You chose to add more funds. Please follow the instructions to add more funds.'
                        });
                        this.sendMore();
                        newCollector.stop();
                    } else {
                        interaction.followUp({
                            content: '> You chose to add more funds. Please follow the instructions to add more funds.'
                        });
                        this.sendMore();
                        newCollector.stop();
                    }

                } else
                    if (interaction.customId === 'continuex') {
                        // this.startDealTimeout();
                        this.fetchTaxID();
                        await this.message.edit({
                            components: [],
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('⚠️ Deal Proceeds with Received Amount')
                                    .setDescription('Sender continues the deal despite receiving a different LTC amount.')
                                    .addFields({
                                        name: 'Situation',
                                        value: 'Received LTC amount differs from the agreed deal.'
                                    }, {
                                        name: 'Decision',
                                        value: `<@${this.receiver}>  If you disagree with the decision, you can cancel the trade.`
                                    })
                                    .setColor(0xFFFF00)
                                    .setTimestamp()
                                    .setFooter({
                                        text: '♻ Fusion MM - Secure Transactions'
                                    })
                            ]
                        });


                        const embed = new EmbedBuilder()
                            .setColor('Yellow')
                            .setTitle('⚠ Trade Notification')
                            .addFields({
                                name: '[INFO]',
                                value: 'Received Amount is (**Insufficient**)'
                            }, {
                                name: '[DECISION]',
                                value: `Sender <@${this.sender}> has decided to continue the deal with the received amount.`
                            }, {
                                name: '[NOTICE]',
                                value: `<@${this.receiver}>, if you disagree with the decision, you can cancel the trade in the coming session.`
                            });

                        if (!interaction.replied) {
                            await interaction.reply({
                                embeds: [embed]
                            });
                            await newCollector.stop();
                        } else {
                            await interaction.followUp({
                                embeds: [embed]
                            });
                        }

                        await newCollector.stop();

                    }
            });

        } catch (err) {
            console.error('Error in incuff:', err);
        }
    }


    async sendMore() {
        try {
            this.counter = 0;
            const remainingAmount = this.ltc_to_receive - this.receivedAmount;
            const requestedAmount = remainingAmount.toFixed(8);
            const usd = await this.ltcToUsd(requestedAmount)

            const pasteButton = new ButtonBuilder()
                .setCustomId(`paste|${this.addy}|${requestedAmount}`)
                .setLabel('Paste')
                .setEmoji(`📃`)
                .setStyle(ButtonStyle.Secondary);

            const qrButton = new ButtonBuilder()
                .setCustomId(`qr|${this.addy}|${requestedAmount}`)
                .setLabel('Show QR')
                .setEmoji(`📃`)
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(pasteButton, qrButton);

            const updatedInvoiceEmbed = new EmbedBuilder()
                .setTitle('♻ Updated Payment Invoice')
                .setColor(0xFFFF33)
                .setDescription(`<@${this.sender}>, Please send the remaining LTC to the updated address below:\n\n\`${this.addy}\``)
                .addFields({
                    name: 'Remaining Amount',
                    value: `\`\`\`${requestedAmount}\`\`\``,
                    inline: true
                }, {
                    name: `${this.currency} Amount`,
                    value: `\`\`\`${this.usd}\`\`\``,
                    inline: true
                })
                .setTimestamp()
                .setFooter({
                    text: 'Send the remaining amount to complete the trade'
                });

            if (this.bb) {
                await this.bb.edit({
                    content: `||<@${this.sender}>||`,
                    components: [row],
                    embeds: [updatedInvoiceEmbed]
                });
            } else {
                this.bb = await this.thread.send({
                    content: `||<@${this.sender}>||`,
                    components: [row],
                    embeds: [updatedInvoiceEmbed]
                });
            }
            await this.waitForTransaction();
        } catch (error) {
            console.error('Error updating LTC to receive:', error);
        }
    }




    async fetchTaxID() {
        try {
            this.disableButtons(this.msg)

            let result = await this.getHash(this.addy);

            if (!result) {
                console.log("Failed to fetch initial transaction data.");
                return;
            }

            const ltcEmbed = new EmbedBuilder()
                .setTitle('🟡 Transaction Detected')
                .setColor(0xFFFF33);

            if (this.dealAmount > this.usd) {
                ltcEmbed.addFields({
                    name: '⚠️ Alert',
                    value: 'The deal was finalized with a lower amount than the agreed upon deal value'
                });
            }

            ltcEmbed.setDescription('- The Payment for this deal has been Detected')
                .addFields({
                    name: 'Confirmations Required',
                    value: `\`\`\`${result.confirmations} / 1\`\`\``
                }, {
                    name: 'Txid',
                    value: `[ \`${result.latestHash}\` ](https://live.blockcypher.com/ltc/tx/${result.latestHash})`
                }, {
                    name: 'Amount Received',
                    value: '`' + this.receivedAmount + '` LTC',
                    inline: true
                }, {
                    name: 'Amount Received',
                    value: `${this.usd}` + ` ${this.currency}`,
                    inline: true
                });
            this.hex = result.latestHash;
            if (this.bb) {
                await this.bb.edit({
                    embeds: [ltcEmbed],
                    components: []
                });
            } else {
                this.bb = await this.thread.send({
                    embeds: [ltcEmbed],
                    components: []
                });
            }


            while (result.confirmations === 0) {

                console.log(`Confirmations in fetchTaxID: ${this.addy} :`, result.confirmations);



                const getRandomJitter = () => Math.floor(Math.random() * 1000) + 1500;
                let time = getRandomJitter() + parseInt(config.timeout);
                await new Promise(resolve => setTimeout(resolve, time));

                result = await this.getHash(this.addy);


                if (result) {

                    if (this.bb) {
                        await this.bb.edit({
                            embeds: [ltcEmbed],
                            components: []
                        });
                    } else {
                        this.bb = await this.thread.send({
                            embeds: [ltcEmbed],
                            components: []
                        });
                    }



                } else {

                    if (this.bb) {
                        await this.bb.edit({
                            embeds: [ltcEmbed],
                            components: []
                        });
                    } else {
                        this.bb = await this.thread.send({
                            embeds: [ltcEmbed],
                            components: []
                        });
                    }
                }

            }

            if (result.confirmations >= 1) {

                const embed = new EmbedBuilder()
                    .setTitle('>  Payment Received by Fusion MM')
                    .setURL(`https://discord.gg/Fusion`)
                    .setColor(0x00FF00)
                if (this.dealAmount > this.usd) {
                    embed.addFields({
                        name: '⚠️ Alert',
                        value: 'The deal was finalized with a lower amount than the agreed upon deal value'
                    })
                }
                embed.addFields({
                    name: '👤 Sender',
                    value: `<@${this.sender}>`,
                    inline: true
                }, {
                    name: '📥 LTC Address',
                    value: `\`\`\`${this.addy}\`\`\``,
                    inline: false
                }, {
                    name: '💰 LTC Amount',
                    value: `\`\`\`${this.ltc_to_receive}\`\`\``,
                    inline: true
                }, {
                    name: `💵 ${this.currency} Amount`,
                    value: `\`\`\`{this.usd}\`\`\``,
                    inline: true
                })
                    .addFields({
                        name: 'Confirmations',
                        value: `\`\`\`1 / 1\`\`\``
                    }, {
                        name: '🌐 Txid',
                        value: `[ \`${result.latestHash}\` ](https://live.blockcypher.com/ltc/tx/${result.latestHash})`
                    }, {
                        name: 'Timestamp',
                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`
                    })
                    .setTimestamp()
                    .setFooter({
                        text: 'Payment Received by ♻ Fusion MM '
                    });

                if (this.bb) {
                    await this.bb.edit({
                        embeds: [ltcEmbed],
                        components: []
                    });
                } else {
                    this.bb = await this.thread.send({
                        embeds: [ltcEmbed],
                        components: []
                    });
                }


                // await this.clearDealTimeout();
                await this.continueDeal();
            }
        } catch (error) {
            console.log("Error in fetchTaxID: ", error);
        }
    }


    disableButtons = async (message) => {
        const updatedComponents = message.components.map(row => {
            const disabledRow = new ActionRowBuilder().addComponents(
                row.components.map(component => ButtonBuilder.from(component).setDisabled(true))
            );
            return disabledRow;
        });

        await message.edit({
            components: updatedComponents
        });
    };

    enableButtons = async (message) => {
        const updatedComponents = message.components.map(row => {
            const disabledRow = new ActionRowBuilder().addComponents(
                row.components.map(component => ButtonBuilder.from(component).setDisabled(false))
            );
            return disabledRow;
        });

        await message.edit({
            components: updatedComponents
        });
    };

    async continueDeal() {

        const newComp = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('releasex')
                    .setLabel('Release')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger),
            );

        try {

            const walletEmbed = new EmbedBuilder()
                .setTitle('💱 Amount Received')
                .setColor(0x00b300)
                .setDescription('> The Bot has received the specified amount of LTC. Please choose an action.')
                .addFields(

                    {
                        name: '📥 Address',
                        value: `\`\`\`${this.addy}\`\`\``,
                        inline: false
                    }, {
                    name: '💰 LTC',
                    value: `\`\`\`${this.receivedAmount}\`\`\``,
                    inline: true
                }, {
                    name: `💵 ${this.currency}`,
                    value: `\`\`\`${this.usd}\`\`\``,
                    inline: true
                }

                )
                .setTimestamp()
                .setFooter({
                    text: '♻ Fusion MM - Wallet Transaction'
                });


            if (this.Newmsg) {
                this.Newmsg = await this.Newmsg.edit({
                    components: [newComp],
                    embeds: [walletEmbed],
                    content: `<@${this.sender}><@${this.receiver}>`
                });
            } else {
                this.Newmsg = await this.thread.send({
                    components: [newComp],
                    embeds: [walletEmbed],
                    content: `<@${this.sender}><@${this.receiver}>`
                });
            }


            const filter = (interaction) => ['cancel', 'releasex'].includes(interaction.customId);
            this.collector = this.Newmsg.createMessageComponentCollector({
                filter,
                time: 604800000
            });

            this.collector.on('collect', async (interaction) => {
                if (!['cancel', 'releasex'].includes(interaction.customId)) return;

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.deferUpdate();
                }

                if (interaction.customId === 'cancel') {
                    if (interaction.user.id === this.sender) {
                        this.disableButtons(this.Newmsg);
                        await this.handleCancel(interaction);
                    } else {
                        await interaction.followUp({
                            content: '> You are not authorized to cancel this trade',
                            ephemeral: true
                        });
                    }
                } else if (interaction.customId === 'releasex') {
                    if (interaction.user.id === this.sender) {
                        await this.handleRelease(interaction);
                    } else {
                        await interaction.followUp({
                            content: '> You are not authorized to release this payment',
                            ephemeral: true
                        });
                    }
                }

            });

        } catch (error) {
            console.error('Error in continueDeal:', error);
        }
    }


    async handleCancel(interaction) {
        const confirm_embed = new EmbedBuilder()
            .setTitle('⚠️ Cancel Trade')
            .setDescription('Are you sure you want to cancel this trade? This action cannot be undone.')
            .setColor(0xFF0000)
            .setTimestamp()
            .setFooter({
                text: 'Cancellation Request'
            });

        const confirm_row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirmCancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('denyCancel')
                    .setLabel('Keep')
                    .setStyle(ButtonStyle.Success)

            );

        this.confirm = await interaction.followUp({
            embeds: [confirm_embed],
            components: [confirm_row]
        });

        const confirmFilter = (btnInteract) => [this.sender, this.receiver].includes(btnInteract.user.id);
        this.finalCollector = interaction.channel.createMessageComponentCollector({
            filter: confirmFilter,
            time: 604800000
        });

        const confirmedBySender = new Set();
        const confirmedByReceiver = new Set();
        const messagesToDelete = [];

        this.finalCollector.on('collect', async (finalInteraction) => {
            if (finalInteraction.customId === 'confirmCancel') {
                if (finalInteraction.user.id === this.sender && !confirmedBySender.has(this.sender)) {
                    confirmedBySender.add(this.sender);
                    messagesToDelete.push(await interaction.channel.send({
                        content: `> <@${this.sender}> Confirmed Trade Cancellation`
                    }));
                } else if (finalInteraction.user.id === this.receiver && !confirmedByReceiver.has(this.receiver)) {
                    confirmedByReceiver.add(this.receiver);
                    messagesToDelete.push(await interaction.channel.send({
                        content: `> <@${this.receiver}> Confirmed Trade Cancellation`
                    }));
                }

                if (confirmedBySender.has(this.sender) && confirmedByReceiver.has(this.receiver)) {
                    this.finalCollector.stop();
                    await this.confirm.delete().catch(error => console.error('Error deleting message:', error));;

                    const new_embed = new EmbedBuilder()
                        .setTitle('Trade Canceled')
                        .setDescription('> Your funds will be refunded. Please provide your LTC address to receive the refund.')
                        .setColor(0xFF0000)
                        .setTimestamp()
                        .setFooter({
                            text: 'Enter your LTC address to receive the refund'
                        });

                    await interaction.editReply({
                        content: `||<@${this.sender}>||`,
                        embeds: [new_embed],
                        components: []
                    });

                    const addressFilter = (m) => m.author.id === this.sender;
                    const addressCollector = interaction.channel.createMessageCollector({
                        filter: addressFilter,
                        time: 604800000
                    });

                    const regex = /^(L|M)[a-km-zA-HJ-NP-Z1-9]{26,33}$|^ltc1[a-zA-HJ-NP-Z0-9]{39,59}$/;

                    function isValidLTCAddress(address) {
                        return regex.test(address);
                    }
                    let ltcAddress = '';

                    addressCollector.on('collect', async (m) => {
                        ltcAddress = m.content.trim();

                        if (!isValidLTCAddress(ltcAddress)) {
                            return;
                        }

                        await m.react('✅');

                        const confirmAddrEmbed = new EmbedBuilder()
                            .setTitle('> 🔒 Confirm LTC Address')
                            .setDescription(`** You entered the following LTC address:\n\n\` > ${ltcAddress}\`\n\n > Is this correct?**`)
                            .setColor(0x303238)
                            .setTimestamp()
                            .setFooter({
                                text: 'Confirm your LTC address'
                            });

                        const confirm_row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('confirmLTC')
                                    .setLabel('Yes, Correct Address')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setEmoji('✅'),
                                new ButtonBuilder()
                                    .setCustomId('resetLTC')
                                    .setLabel('Reset')
                                    .setStyle(ButtonStyle.Secondary)
                            );

                        this.new = await m.reply({
                            embeds: [confirmAddrEmbed],
                            components: [confirm_row]
                        });

                        const confirmFilter = (i) => i.user.id === this.sender;
                        const confirmCollector = m.channel.createMessageComponentCollector({
                            filter: confirmFilter,
                            time: 604800000
                        });

                        confirmCollector.on('collect', async (confirmAction) => {
                            if (confirmAction.customId === 'confirmLTC') {
                                if (!confirmAction.replied) await confirmAction.deferUpdate();

                                const confirmedBySenderEmbed = new EmbedBuilder()
                                    .setTitle('✅ Confirmed by Sender')
                                    .setDescription(`> <@${this.sender}> has confirmed the trade details.`)
                                    .addFields({
                                        name: 'Receiver Address',
                                        value: `\`${ltcAddress}\``,
                                        inline: false
                                    }, {
                                        name: 'Received Amount',
                                        value: `\`${this.receivedAmount}\``,
                                        inline: true
                                    }, {
                                        name: 'Timestamp',
                                        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                                        inline: true
                                    })
                                    .setColor(0x00FF00)
                                    .setTimestamp();

                                await this.new.edit({
                                    components: [],
                                    embeds: [confirmedBySenderEmbed]
                                });
                                addressCollector.stop();
                                await this.sendLTC(ltcAddress);

                            } else if (confirmAction.customId === 'resetLTC') {
                                await confirmAction.reply({
                                    content: '> LTC address reset. Please enter your LTC address again.'
                                });
                                ltcAddress = '';
                                addressCollector.resetTimer();
                            }
                        });
                    });
                }
            } else if (finalInteraction.customId === 'denyCancel') {
                this.enableButtons(this.Newmsg);

                messagesToDelete.push(await this.thread.send({
                    content: `> <@${finalInteraction.user.id}> Denied Trade Cancellation`
                }));
                this.collector.stop()
                this.finalCollector.stop();
                await this.confirm.delete().catch(error => console.error('Error deleting message:', error));;

                for (const msg of messagesToDelete) {
                    await msg.delete().catch(error => console.error('Error deleting message:', error));;
                }

                await this.continueDeal();
            }
        });

    }




    async handleRelease(interaction) {
        const confirm_embed = new EmbedBuilder()
            .setTitle('> Confirm Payment Release')
            .setDescription(` - Do You Confirm That You Want To Release Funds To :  <@${this.receiver}>?`)
            .setColor(0xFFFF33);

        const confirm_row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirmRelease')
                    .setLabel('Yes!')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('cancelRelease')
                    .setLabel('No!')
                    .setStyle(ButtonStyle.Secondary)
            );

        this.x = await interaction.editReply({
            embeds: [confirm_embed],
            components: [confirm_row]
        });

        const confirmFilter = (i) => i.user.id === interaction.user.id;
        const confirmCollector = interaction.channel.createMessageComponentCollector({
            filter: confirmFilter,
            time: 604800000
        });

        confirmCollector.on('collect', async (confirmAction) => {

            if (confirmAction.customId === 'confirmRelease') {
                try {
                    if (!confirmAction.replied && !confirmAction.deferred) {
                        await confirmAction.deferUpdate();
                    }
                } catch (error) {
                    console.error('Failed to defer interaction:', error);
                }
                this.disableButtons(this.x)
                const paymentReleasedEmbed = new EmbedBuilder()
                    .setTitle('> Payment Released')


                if (this.dealAmount > this.usd) {
                    paymentReleasedEmbed.addFields({
                        name: '⚠️ Alert',
                        value: 'The deal was finalized with a lower amount than the agreed upon deal value'
                    });
                }

                paymentReleasedEmbed.setDescription(`Payment of ${this.usd} ${this.currency} has been released to <@${this.receiver}>. \n\n >**Please provide your LTC address to receive the funds.**`)
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({
                        text: 'Payment Released'
                    });



                await this.thread.send({
                    content: `<@${this.receiver}>`,
                    embeds: [paymentReleasedEmbed],
                    components: []
                });

                const addressFilter = (m) => m.author.id === this.receiver;
                const addressCollector = interaction.channel.createMessageCollector({
                    filter: addressFilter,
                    time: 604800000
                });

                const ltcAddressRegex = /^(L|M)[a-km-zA-HJ-NP-Z1-9]{26,33}$|^ltc1[a-zA-HJ-NP-Z0-9]{39,59}$/;

                function isValidLTCAddress(address) {
                    return ltcAddressRegex.test(address);
                }

                addressCollector.on('collect', async (m) => {
                    const ltcAddress = m.content.trim();

                    if (!isValidLTCAddress(ltcAddress)) {
                        return;
                    }

                    await m.react('✅');

                    const confirmAddrEmbed = new EmbedBuilder()
                        .setTitle('🔒 Confirm LTC Address')
                        .setDescription(`> You entered the following LTC address:\n\n\`${ltcAddress}\`\n\nIs this correct?`)
                        .setColor(0x303238)
                        .setTimestamp()
                        .setFooter({
                            text: 'Confirm your LTC address'
                        });

                    const confirm_row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirmLTC')
                                .setLabel('Yes, Correct Address')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId('resetLTC')
                                .setLabel('Reset')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    this.new = await m.reply({
                        embeds: [confirmAddrEmbed],
                        components: [confirm_row]
                    });

                    const confirmFilter = (i) => i.user.id === this.receiver;
                    const confirmCollector = m.channel.createMessageComponentCollector({
                        filter: confirmFilter,
                        time: 604800000
                    });

                    confirmCollector.on('collect', async (confirmAction) => {
                        if (confirmAction.customId === 'confirmLTC') {
                            if (!confirmAction.replied) await confirmAction.deferUpdate();

                            const confirmedByReceiverEmbed = new EmbedBuilder()
                                .setTitle('✅ Confirmed by Receiver')
                                .setDescription(`> <@${this.receiver}> has confirmed the trade details.`)
                                .addFields({
                                    name: 'Receiver Address',
                                    value: `\`${ltcAddress}\``,
                                    inline: false
                                }, {
                                    name: 'Received Amount',
                                    value: `\`${this.receivedAmount}\``,
                                    inline: true
                                }, {
                                    name: 'Timestamp',
                                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                                    inline: true
                                })
                                .setColor(0x00FF00)
                                .setTimestamp();

                            await this.new.edit({
                                components: [],
                                embeds: [confirmedByReceiverEmbed]
                            });
                            addressCollector.stop();
                            await this.sendLTC(ltcAddress);
                        } else if (confirmAction.customId === 'resetLTC') {
                            await confirmAction.reply({
                                content: '> LTC address reset. Please enter your LTC address again.'
                            });
                            addressCollector.resetTimer();
                        }
                    });
                });




            } else if (confirmAction.customId === 'cancelRelease') {
                try {
                    await confirmAction.deferUpdate();
                } catch (error) {
                    console.error('Failed to defer interaction:', error);
                }


                await confirmAction.followUp({
                    content: `> <@${this.sender}> Payment Release Cancelled`
                });
                this.enableButtons(this.Newmsg)
                this.collector.stop();
                await confirmCollector.stop();
                await this.continueDeal();


            }
        });

    }


    disableButtons(msg) {
        const components = msg.components.map(row => {
            const actionRow = ActionRowBuilder.from(row);
            actionRow.components.forEach(component => component.setDisabled(true));
            return actionRow;
        });
        return msg.edit({
            components
        });
    }

    enableButtons(msg) {
        const components = msg.components.map(row => {
            const actionRow = ActionRowBuilder.from(row);
            actionRow.components.forEach(component => component.setDisabled(false));
            return actionRow;
        });
        return msg.edit({
            components
        });
    }

    async getUseragent() {
        const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0"
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }


    async AxiosInstance() {
        const proxyAgent = new HttpsProxyAgent(`${config.proxy}`);
        const axiosWithProxy = axios.create({
            httpsAgent: proxyAgent
        });
        return axiosWithProxy;
    }

    async UsdToLtc(amount) {
        const maxAttempts = 3;
        let attempt = 0;

        while (attempt < maxAttempts) {
            try {
                //const apiKey = await this.getNextApiKey();
                //const axiosWithProxy = await this.AxiosInstance();

                const apiUrl = `https://min-api.cryptocompare.com/data/price?fsym=${this.currency}&tsyms=LTC`;
                const response = await axios.get(apiUrl);
                const ltcrate = response.data.LTC;

                if (ltcrate) {
                    const ltcAmount = amount * ltcrate;
                    return ltcAmount;
                } else {
                    throw new Error('Invalid data structure in API response');
                }
            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed: Error fetching ${this.currency} to LTC rate - ${error.message}`);
                if (attempt === maxAttempts - 1) {
                    console.error(`Max attempts reached. Unable to fetch ${this.currency} to LTC rate.`);
                    return null;
                } else {
                    attempt++;
                }
            }
        }
    }



    async ltcToUsd(amount) {
        const maxAttempts = 3;
        let attempt = 0;




        while (attempt < maxAttempts) {
            try {
                //const axiosWithProxy = await this.AxiosInstance();

                let ltcPrice;

                if (this.currency === "EUR") {
                    const endpoint = `https://min-api.cryptocompare.com/data/price?fsym=LTC&tsyms=${this.currency}`;
                    const response = await axios.get(endpoint);
                    const data = response.data.EUR;
		            //this.usdbaldata = data;
                    ltcPrice = data;
                    this.current_rate = data;
                    //console.log(response)
                    //onsole.log(response.data)
                    console.log("EUR")
                    console.log(data)
                    console.log(this.usd)
                } else {
                    const endpoint = `https://min-api.cryptocompare.com/data/price?fsym=LTC&tsyms=${this.currency}`;
                    const response = await axios.get(endpoint);
                    const data = response.data.USD;
		            //this.usdbaldata = data;
                    ltcPrice = data;
                    this.current_rate = data;
                    //console.log(response)
                    //console.log(response.data)
                    console.log("USD")
                    console.log(data)
                    console.log(this.usd)
                }

                const usdBalance = amount * ltcPrice;
                console.log(usdBalance)
                return usdBalance;
            } catch (error) {
                console.error(`Attempt ${attempt + 1} failed: Error fetching LTC to ${this.currency} rate - ${error.message}`);
                if (attempt === maxAttempts - 1) {
                    console.error(`Max attempts reached. Unable to fetch LTC to ${this.currency} rate.`);
                    return null;
                } else {
                    attempt++;
                }
            }
        }
    }





    async getHash(address) {

        for (let attempt = 1; attempt <= 3; attempt++) {
            const apiKey = await this.getNextApiKey();
            //const axiosWithProxy = await this.AxiosInstance();

            const endpoint = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/full?token=${apiKey}`;

            try {
                const response = await axios.get(endpoint);

                if (!response.data || !response.data.txs || response.data.txs.length === 0) {
                    console.error(`No transaction data found for address ${address}`);
                    if (attempt === 3) return null;
                    continue;
                }

                const latestTransaction = response.data.txs[0];
                const latestHash = latestTransaction.hash;
                const confirmations = latestTransaction.confirmations ?? 0;

                return {
                    latestHash,
                    confirmations
                };
            } catch (error) {
                console.error(`Attempt ${attempt} - Error fetching transaction hash: ${error.message}`);
                if (attempt < 3) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await this.delay(delay);
                } else {
                    return null;
                }
            }
        }
    }


    async satoshisToLtc(satoshis) {
        return satoshis / 100000000;
    }




}
module.exports = Trade;