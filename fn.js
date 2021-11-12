function replyConfigMessage(messageObject, content, delay = 10) {
  messageObject.channel.send(content)
  .then(replyMessage => {
    setTimeout((() => {
      replyMessage.delete();
    }), delay);
  })
  if (messageObject.isMessageManager)
    setTimeout((() => {
      messageObject.delete();
    }), delay);
}

function pageOffset(isForward){
  return isForward ? 1 : -1;
}

function urlDump(content) {
  const patt = {
    "pixiv" : /^.*\.pixiv\..*\/(\d+)/i,
    "pixivE": /^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i
  };
  if (content.match(patt['pixiv']))
    return { "uid" :content.match(patt['pixiv'])[1] , "website": 'pixiv'};
  if (content.match(patt['pixivE']))
    return { "uid" :content.match(patt['pixivE'])[1] , "website": 'pixiv'};
  return null;
}

async function initGuildCmd(rest, Routes , userID, guildsHandling, commands) {
  try {
    await rest.put(
      Routes.applicationGuildCommands(userID, guildsHandling),
      { body: commands }
    );
  } catch (error) {
    switch( error.rawError.code ) {
      case 50001:
        console.error(
          "[ warn ] Guild ID = " +
          guildsHandling +
          ": Cannot update slash command without 'applications.commands' scope."
        );
      break;
      default:
      console.error(error);
    }
  }
}

async function initGlobalCmd(client) {
  //Initilize const
  const config = require(require("./shareData.js").configPath);
  const { Routes } = require('discord-api-types/v9');
  const { REST } = require('@discordjs/rest');
  const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
  const { globalCommands } = require("./shareData.js");
  //Initilize commands
  console.log(`[ info ] Initilizing commands ...`);
  try {
    await rest.put(
      Routes.applicationCommands(config.userID),
      { body: globalCommands }
    );
    console.log(`[ info ] Initilizing guild commands finished.`);
  } catch (error) {
    console.error(error);
  }
}

async function initCmdAll(client) {
  //Check first
  if (client.guildsHandling == null) client.guildsHandling = [];
  const guildsShouldHandle = Array.from(client.guilds.cache.keys());
  const guildsNew = guildsShouldHandle.filter(
    values => !client.guildsHandling.includes(values)
  );
  const guildsLeft = client.guildsHandling.filter(
    values => !guildsShouldHandle.includes(values)
  );
  if (guildsLeft.length != 0) client.guildsHandling = guildsShouldHandle;
  if (guildsNew.length == 0) return;
  //Initilize const
  const config = require(require("./shareData.js").configPath);
  const { Routes } = require('discord-api-types/v9');
  const { REST } = require('@discordjs/rest');
  const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
  const { commands } = require("./shareData.js");
  const permissionManage = require("./shareData.js").permission.botManageMassage;
  //Initilize commands
  console.log(`[ info ] Initilizing guild commands ...`);
  var promisePool = [];
  //Make a task array for multi-tasking.
  for (var i=0; i<guildsNew.length; i++) {
    promisePool.push(
      initGuildCmd(rest, Routes, config.userID, guildsNew[i], commands)
    );
  }
  //Launch tasks.
  await Promise.all(promisePool);
  //Register handling guilds.
  client.guildsHandling = guildsShouldHandle;
  console.log(`[ info ] Initilizing guild commands finished.`);
}

function checkParameterUndfeind(interaction, varKey) {
  var parameterUndfeind = [];
  var varKeyCurrent;
  for(var i=0; i<varKey.length; i++){
    varKeyCurrent = interaction.options.get(varKey[i]);
    if(varKeyCurrent == null) parameterUndfeind.push(varKey[i]);
  }
  return parameterUndfeind;
}

function makePageRow(data) {
  var pageRow = {
    type: 'ACTION_ROW',
    components: [
      {
        type: 'BUTTON',
        label: '🗑️',
        customId: 'remove',
        style: 'DANGER',
        emoji: null,
        url: null,
        disabled: false
      }
    ]
  }
  if (data.pageCount <= 1) return pageRow;

  return {
    type: 'ACTION_ROW',
    components: [
      {
        type: 'BUTTON',
        label: '<<',
        customId: 'previousPage',
        style: 'PRIMARY',
        emoji: null,
        url: null,
        disabled: (data.currentPage <= 1)
      },
      {
        type: 'BUTTON',
        label: data.currentPage + '/' + data.pageCount,
        customId: 'page',
        style: 'SECONDARY',
        emoji: null,
        url: null,
        disabled: true
      },
      {
        type: 'BUTTON',
        label: '>>',
        customId: 'nextPage',
        style: 'PRIMARY',
        emoji: null,
        url: null,
        disabled: (data.currentPage >= data.pageCount)
      },
      pageRow.components[0]
    ]
  };
}

function textArray2str(textArray, separator) {
  if (textArray == null) return [];
  var s = '';
  const lastItem = textArray.pop();
  textArray.forEach((item, i) => {
    s += item + separator;
  });
  s += lastItem;
  return s;
}

function preFilter(interaction) {
  if(interaction.user.bot) return 'userIsBot';
  if(interaction.channel == null) return 'dmChannel';
  if (!(
    (interaction.channel.type == 'GUILD_TEXT') ||
    (interaction.channel.type == 'GUILD_PUBLIC_THREAD') ||
    (interaction.channel.type == 'GUILD_PRIVATE_THREAD')
  )) return 'notTextChannel';
  return 'pass';
}

function rejectInteration(interaction, reason) {
  switch(reason) {
    case 'pass':
      return false;
    case 'buttonPermission':
      interaction.update({});
    break;
    case 'userIsBot':
      interaction.reply({
        content: 'All bots cannot use this application  !',
        ephemeral: true
      });
    break;
    case 'dmChannel':
      interaction.reply({
        content: 'This application is design for guilds !',
        ephemeral: true
      });
    break;
    case 'notTextChannel':
      interaction.reply({
        content: 'This application can not be use in non-text channel !',
        ephemeral: true
      });
    break;

  }
  return true;
}

module.exports = {
  replyConfigMessage,
  pageOffset,
  urlDump,
  initCmdAll,
  initGlobalCmd,
  checkParameterUndfeind,
  makePageRow,
  textArray2str,
  preFilter,
  rejectInteration
};
