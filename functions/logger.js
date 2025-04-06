const {
    EmbedBuilder,
    WebhookClient
} = require("discord.js");
const discordTranscripts = require('discord-html-transcripts');

const toml = require('toml');
const fs = require('fs');
const config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));


module.exports = async (log, content) => {
    let logEmbed;
    let webhookUrl;


    switch (log) {
        case "transcript":
            logEmbed = new EmbedBuilder()
                .setTitle("📂 Transcript")
                .addFields({
                    name: 'Sender',
                    value: `<@${content.sender}>`,
                    inline: true
                }, {
                    name: 'Receiver',
                    value: `<@${content.receiver}>`,
                    inline: true
                //}, {
                    //name: 'Currency',
                    //value: `\`${this.currency}\``,
                    //inline: true
                }, {
                    name: 'Amount',
                    value: `\`${content.amount}\``,
                    inline: true
                }, {
                    name: 'Txid',
                    value: `[ \`${content.txid}\` ](https://live.blockcypher.com/ltc/tx/${content.txid})`
                }, )
                .setColor('Green')
                .setTimestamp();
            webhookUrl = config.transcript_webhook
            break;

        case "logs":
            let amount = parseFloat(content.amount);

            logEmbed = new EmbedBuilder()
                .setTitle(`LiteCoin Trade Completed`)
                .setColor('Blue')
                .addFields({
                    name: 'Sender',
                    value: `<@${content.sender}>`,
                    inline: true
                }, {
                    name: 'Receiver',
                    value: `<@${content.receiver}>`,
                    inline: true
                //}, {
                    //name: 'Currency',
                    //value: `\`${this.currency}\``,
                    //inline: true
                }, {
                    name: 'Amount',
                    value: `\`${amount.toFixed(3)}\``,
                    inline: true
                }, {
                    name: 'Txid',
                    value: `[ \`${content.txid}\` ](https://live.blockcypher.com/ltc/tx/${content.txid})`
                })

            webhookUrl = config.payment_webhook
            break;

        default:
            return;
    }


    const webhookClient = new WebhookClient({
        url: webhookUrl
    });

    if (log == 'logs') {
        webhookClient.send({
            embeds: [logEmbed],
        });

    } else {

        const attachment = await discordTranscripts.createTranscript(content.channel, {
            poweredBy: false,
            ssr: true
        });


        webhookClient.send({
            embeds: [logEmbed],
            files: [attachment],
        });
    }
};