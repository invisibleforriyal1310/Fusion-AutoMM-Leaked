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
        .setName('balance')
        .setDefaultMemberPermissions(PermissionFlagsBits.Admininstrator)
        .setDescription('shows balance of addy'),
    async execute(client, interaction) {

        let thread = await interaction.channel;
        let ID = interaction.channelId;



        this.ltcaddy = null
        this.ltckey = null

        await interaction.reply({
            content: `> 🟢 Processing .  .  .  .`,
            ephemeral: true
        })

        const data = await getData(ID);
        if (data) {
            this.ltcaddy = data.LTCaddy
            this.ltckey = data.LTCkey
            let LTCbal = await balance(this.ltcaddy)
            if (LTCbal <= 0) {

                return interaction.editReply({
                    content: `> 🧾 No Balance Found \n> ${this.currency} : 0 \n> LTC : ${LTCbal.toFixed(8)}`,
                    ephemeral: true
                })
            }
            let USDbal = await ltcToUsd(LTCbal)
            return interaction.editReply({
                content: `🧾  Balance Found \n> ${this.currency} ${USDbal} : 0 \n> LTC : ${LTCbal.toFixed(8)}`,
                ephemeral: true
            })
        }
        return

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
                    interaction.editReply(`Record with threadId ${ID} not found.`);
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
                return usdBalance;
            } catch (error) {
                console.error(`Error fetching LTC to ${this.currency} rate: ${error.message}`);
                return null;
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
                console.log('LTC in Wallet ,', ltcbal)
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
}