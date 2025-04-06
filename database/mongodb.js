const mongoose = require('mongoose');

module.exports = (client) => {
    mongoose.connect(client.config.mongoURL).then(() => {
        console.log(`   ✅  Connected to database.`); // Green color
    }).catch((e) => {
        console.log('\x1b[31m%s\x1b[0m', `⚠️ Unable to connect to the database: \n${e}`); // Red color
    });
};