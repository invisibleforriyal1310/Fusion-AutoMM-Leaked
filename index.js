const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials
} = require("discord.js");
const toml = require('toml');
const fs = require('fs');

const client = new Client({
  intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
  ],
  shards: "auto",
  partials: [
      Partials.Message,
      Partials.Channel,
      Partials.GuildMember,
      Partials.Reaction,
      Partials.GuildScheduledEvent,
      Partials.User,
      Partials.ThreadMember,
  ],
});

client.slashcommands = new Collection();
client.commands = new Collection();
client.aliases = new Collection();
client.config = toml.parse(fs.readFileSync('./config.toml', 'utf-8'));

client.on('shardError', async error => {
  console.error(`Shard error: ${error}`);
  // Send error message to a specific channel or log to a file
});

process.on("unhandledRejection", (e) => {
  console.error(`Unhandled rejection: ${e}`);
  console.error(e.stack);
  // Send error report to a monitoring service or log to a file
});

process.on("uncaughtException", (e) => {
  console.error(`Uncaught exception: ${e}`);
  console.error(e.stack);
  // Send error report to a monitoring service or log to a file
});

process.on("uncaughtExceptionMonitor", (e) => {
  console.error(`Uncaught exception monitor: ${e}`);
  console.error(e.stack);
  // Send error report to a monitoring service or log to a file
});

for (let handler of ['command', 'event']) {
  require(`./handlers/${handler}`)(client);
}
// require('./functions/class')(client);

module.exports.client = client;
client.login(client.config.token);