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
        .setName('manual')
        .setDefaultMemberPermissions(PermissionFlagsBits.Admininstrator)
        .setDescription('release funds in optional ltc address')
        .addStringOption(option =>
            option.setName('addy')
            .setDescription('valid ltc address')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('key')
            .setDescription('valid ltc key')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('amount')
            .setDescription('valid ltc amount')
            .setRequired(true))
        .addStringOption(option =>
            option.setName('sendto')
            .setDescription('valid ltc sendto')
            .setRequired(true)),
    async execute(client, interaction) {
        const addy = await interaction.options.getString('addy');
        const l_key = await interaction.options?.getString('key');
        const l_amount = await interaction.options?.getString('amount');
        const l_sendto = await interaction.options?.getString('sendto');

        let thread = await interaction.channel;


        if (l_key || l_amount) {
            if (l_key && l_amount) {
                let fee = 0.000013;

                this.ltcaddy = addy;
                this.ltckey = l_key;
                this.am = l_amount;

                let LTCbal = await balance(this.ltcaddy);
                let check = await UsdToLtc(this.am);
                let USDbal = await ltcToUsd(LTCbal - fee);


                if (LTCbal <= 0) {
                    fee = 0;
                    return interaction.reply({
                        content: `> 🧾 No Balance Found \n> USD: 0 \n> LTC: ${LTCbal}`,
                        ephemeral: true
                    });
                }
                else if (LTCbal >= check) {
                    interaction.reply({
                        content: `> 🌐 Requested Release  . . . `,
                        ephemeral: true
                    });

                    await SENDMONEY(check, this.ltcaddy, this.ltckey, fee, l_sendto);
                }
                else {
                    return interaction.reply({
                        content: `> 🧾 Insufficient Balance \n> USD: ${USDbal} \n> LTC: ${LTCbal}`,
                        ephemeral: true
                    });
                }
            } else {
                return interaction.reply({
                    content: `One of the values is invalid or was not provided.`,
                    ephemeral: true
                });
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

        async function UsdToLtc(amount) {
            const endpoint = 'https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms=LTC';

            try {
                const response = await axios.get(endpoint);
                const data = response.data;

                if (data && data.LTC) {
                    const ltcAmount = amount * data.LTC;
                    return ltcAmount;
                } else {
                    throw new Error('Invalid data structure in API response');
                }
            } catch (error) {
                console.error(`Error fetching USD to LTC rate: ${error.message}`);
                return null;
            }
        }

        async function SENDMONEY(bal, ltcaddy, ltckey, OP, l_sendto) {



            try {

                try {
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
                        changeAddress: l_sendto.toString(),
                        to: [{
                            address: l_sendto.toString(),
                            value: parseFloat(formattedFinalBalance)
                        }]
                    });

                    this.txId = hax.data.txId;
                    console.log(this.txId);
                    const fundReleasedEmbed = new EmbedBuilder()
                        .setTitle('🟢 Funds Released')
                        .setDescription(
                            `The funds have been released to the following LTC address:\n\n\`${l_sendto}\``
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