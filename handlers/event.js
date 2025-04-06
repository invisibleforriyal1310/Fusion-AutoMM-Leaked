const {
  blue,
  green,
  cyan,
  yellow,
  magenta
} = require('kleur');
const fs = require('node:fs');
const path = require('node:path');

module.exports = (client) => {
  console.clear();
  console.log(`${magenta(' Slash Commands ')}${blue('Loading...')}`);
  console.log(`${magenta(' Events ')}${blue('Loading...')}`);

  // Cache the directory path to avoid recalculating it in each iteration
  const eventsPath = path.resolve(__dirname, '../events');

  try {
      const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

      eventFiles.forEach(file => {
          const filePath = path.join(eventsPath, file);
          const event = require(filePath);

          if ('name' in event && 'execute' in event) {
              if (event.once) {
                  client.once(event.name, (...args) => event.execute(...args));
              } else {
                  client.on(event.name, (...args) => event.execute(...args));
              }
              console.log(`  ${green('✅')} Loaded event: ${file}`);

              if (event.aliases && Array.isArray(event.aliases)) {
                  event.aliases.forEach(alias => client.aliases.set(alias, event.name));
              }
          } else {
              console.log(`  ${yellow('⚠️')} [WARNING] The event at ${filePath} is missing a required "name" or "execute" property.`);
          }
      });

      console.log(`${cyan('All events have been loaded successfully.')}`);
  } catch (error) {
      console.error(`${yellow('⚠️')} Error while loading events:`, error);
  }

  console.log(`${magenta(' Slash Commands ')}${green('Loaded!')}`);
  console.log(`${magenta(' Events ')}${green('Loaded!')}`);
};