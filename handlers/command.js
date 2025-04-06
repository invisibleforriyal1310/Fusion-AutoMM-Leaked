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

  const slashCommandsPath = path.resolve(__dirname, '../slashcommands');

  try {
      const commandFiles = fs.readdirSync(slashCommandsPath).filter(file => file.endsWith('.js'));

      commandFiles.forEach(file => {
          const filePath = path.join(slashCommandsPath, file);
          const command = require(filePath);

          if ('data' in command && 'execute' in command) {
              client.commands.set(command.data.name, command);
              console.log(`  ${green('✅')} Loaded command: ${file}`);

              if (command.aliases && Array.isArray(command.aliases)) {
                  command.aliases.forEach(alias => client.aliases.set(alias, command.data.name));
              }
          } else {
              console.log(`  ${yellow('⚠️')} [WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
          }
      });

      console.log(`${cyan('All slash commands have been loaded successfully.')}`);
  } catch (error) {
      console.error(`${yellow('⚠️')} Error while loading slash commands:`, error);
  }
};