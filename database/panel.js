const mongoose = require('mongoose');

const panelModel = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    channelId: {
        type: String,
        required: false
    },
    messageId: {
        type: String,
        required: false
    },
    buttonId: {
        type: String,
        required: false
    },
})

module.exports = mongoose.model('panel', panelModel);