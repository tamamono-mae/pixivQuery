const config = require(require("./shareData.js").configPath);
const { Routes } = require('discord-api-types/v9');
const { REST } = require('@discordjs/rest');
const memoryCache = require('memory-cache');
const { commands, globalCommands } = require("./shareData.js");
//initialize const
const permissionManage = require("./shareData.js").permission.userManageMassage;
const { getManagerRole } = require("./dbOperation.js");

async function initGuildCmd(guild, managerRoles) {
  const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
  commands.forEach((command, i) => {
    command.permissions = [{
      id: guild.ownerID,
      type: 'USER',
      permission: true,
    }];
    managerRoles.forEach((roleID, i) => {
      command.permissions.push({
        id: roleID,
        type: 'ROLE',
        permission: true,
      });
    });
  });

  try {
    await rest.put(
      Routes.applicationGuildCommands(config.userID, guild.id),
      { body: commands }
    );
  } catch (error) {
    switch( error.rawError.code ) {
      case 50001:
        console.warn(
          "[ warn ] Guild ID = " +
          guild.id +
          ": Cannot update slash command without 'applications.commands' scope."
        );
      break;
      default:
      console.error(error);
    }
  } finally {
    if(memoryCache.get('managerRoles_guildId'+guild.id) != null)
      memoryCache.del('managerRoles_guildId'+guild.id);
    memoryCache.put('managerRoles_guildId'+guild.id, managerRoles);
  }
}

async function initGlobalCmd(client) {
  const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
  //initialize commands
  console.info(`[ info ] Initializing global commands ...`);
  try {
    await rest.put(
      Routes.applicationCommands(config.userID),
      { body: globalCommands }
    );
    console.info(`[ info ] Initializing global commands finished.`);
  } catch (error) {
    console.error(error);
  }
}

async function initCmdAll(client) {
  //Check first
  if (client.guildsHandling == null) client.guildsHandling = [];
  const guildCache = client.guilds.cache;
  const guildsShouldHandle = Array.from(guildCache.keys());
  const guildsNew = guildsShouldHandle.filter(
    values => !client.guildsHandling.includes(values)
  );
  const guildsLeft = client.guildsHandling.filter(
    values => !guildsShouldHandle.includes(values)
  );
  if (guildsLeft.length != 0) client.guildsHandling = guildsShouldHandle;
  if (guildsNew.length == 0) return;

  //initialize commands
  console.info(`[ info ] Initializing guild commands ...`);
  let promisePool = [];
  let managerRoles;
  //Make a task array for multi-tasking.
  for (let i=0; i<guildsNew.length; i++) {
    managerRoles = await getManagerRole(guildsNew[i]);
    promisePool.push(
      initGuildCmd(guildCache.get(guildsNew[i]), managerRoles)
    );
  }
  //Launch tasks.
  await Promise.all(promisePool);
  //Register handling guilds.
  client.guildsHandling = guildsShouldHandle;
  console.info(`[ info ] Initializing guild commands finished.`);
}

module.exports = {
  initGuildCmd,
  initCmdAll,
  initGlobalCmd
};
