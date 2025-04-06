const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const axios = require('axios');
const toml = require('toml');
const fs = require('fs');
const config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));
const sdk = require('../.api/apis/tatumdocs')
module.exports = {
    data: new SlashCommandBuilder()
        .setName('release')
        .setDefaultMemberPermissions(PermissionFlagsBits.Admininstrator)
        .setDescription('release funds in optional ltc address')
        .addStringOption(option =>
            option.setName('addy')
            .setDescription('valid ltc address')
            .setRequired(true)),
    async execute(client, interaction) {
        let addy = await interaction.options.getString('addy');
        console.log(addy);

        let thread = await interaction.channel;
        let ID = interaction.channelId;

        this.ltcaddy = null;
        this.ltckey = null;

        const data = await getData(ID);
        if (data) {
            let fee = 0.000013;

            this.ltcaddy = data.LTCaddy;
            this.ltckey = data.LTCkey;
            let LTCbal = await balance(this.ltcaddy);
            if (LTCbal <= 0) {
                fee = 0;
                return interaction.reply({
                    content: `> 🧾 No Balance Found \n> USD : 0 \n> LTC : ${LTCbal}`,
                    ephemeral: true
                });
            }

            interaction.reply({
                content: `> 🌐 Requested Release  . . . `,
                ephemeral: true
            });

            let USDbal = await ltcToUsd(LTCbal - fee);
            console.log(USDbal);


            await SENDMONEY(addy, fee, this.ltcaddy, this.ltckey);
        }

        async function getData(ID) {
            try {
                const filePath = './trades.json';
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const record = data[ID];
                if (record) {
                    return {
                        LTCkey: record.LTCkey,
                        LTCaddy: record.LTCaddy
                    };
                } else {
                    await interaction.reply({ephemeral:true, content: `> Record With ThreadId ${ID} not found.`});
                    return null;
                }
            } catch (error) {
                console.error('Error reading or parsing state.json:', error);
                return null;
            }
        }

        async function ltcToUsd(amount) {
            const endpoint = 'https://min-api.cryptocompare.com/data/price?fsym=LTC&tsyms=USD';

            try {
                const response = await axios.get(endpoint);
                const data = response.data;

                console.log('Amount: ', amount);
                console.log('Data: ', data);

                const ltcPrice = data.USD;
                const usdBalance = amount * ltcPrice;

                console.log('usdBalance: ', usdBalance);
                return parseFloat(usdBalance);
            } catch (error) {
                console.error(`Error fetching LTC to USD rate: ${error.message}`);
                return null;
            }
        }

        async function SENDMONEY(address, OP, ltcaddy, ltckey) {



            try {
                let bal;
                try {
                    bal = await balance(ltcaddy);
                    console.log('LTC we got from balance:', bal);
                } catch (err) {
                    console.error('Error checking balance:', err);
                    throw new Error('Failed to check balance');
                }

                const fee = parseFloat(OP);
                console.log(fee)
                if (isNaN(fee) || fee < 0) {
                    throw new Error("Invalid fee value. Fee should be a non-negative number.");
                }
                console.log('Fee:', fee);


                const finalBalance = bal - fee;
                const formattedFinalBalance = parseFloat(finalBalance).toFixed(8);
                console.log('> LTC after subtracting fee:', finalBalance);

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
                            address: ltcaddy.toString(),
                            privateKey: ltckey.toString()
                        }],
                        fee: fee.toString(),
                        changeAddress: address.toString(),
                        to: [{
                            address: address.toString(),
                            value: parseFloat(formattedFinalBalance)
                        }]
                    });

                    this.txId = hax.data.txId;
                    console.log(this.txId);
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
                    console.log(fundReleasedEmbed)
                    interaction.editReply({
                        embeds: [fundReleasedEmbed]
                    })
                    await interaction.channel.send({
                        embeds: [fundReleasedEmbed]
                    });
                } catch (err) {
                    console.error('Error sending LTC:', err);
                    throw new Error('Failed to send LTC');
                }
            } catch (err) {
                console.error('Error in sendLTC function:', err);
                interaction.editReply({
                    content: `> ⚠ Error while release: ${err}`
                })

                await interaction.channel.send({
                    content: `> ⚠ Error: ${err.message} \n > Please Reach Out Support !`
                });
            }
        }

        async function balance(address) {
            try {
                const endpoint = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance?token=${config.apiToken[0]}`;
                const response = await axios.get(endpoint);
                const data = response.data;
                const bal = data.balance || 0;
                const unbal = data.unconfirmed_balance || 0;
                const ltcbal = await satoshisToLtc(bal);
                console.log('LTC in Wallet ,', ltcbal);
                return parseFloat(ltcbal);
            } catch (err) {
                console.error('Error retrieving LTC balance:', err);
                throw err;
            }
        }

        async function satoshisToLtc(satoshis) {
            return satoshis / 100000000;
        }
    }
};