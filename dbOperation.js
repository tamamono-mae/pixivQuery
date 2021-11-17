const config = require(require("./shareData.js").configPath);
const configTables = ['guildFunction', 'channelFunction', 'guildManager' ];
const cacheTables = ['cacheMsg'];

const cacheDb = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: config.pathToCacheDb
  },
  useNullAsDefault: true
});
const configDb = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: config.pathToConfigDb
  },
  useNullAsDefault: true
});

const dbCache = require('memory-cache');
const { webIcon2Types } = require('./shareData.js');

function fetchCache(messageObject) {
  return cacheDb('cacheMsg')
  .where('sourceChannelId', messageObject.channel.id)
  .andWhere('replyId', messageObject.id)
  .then(rows => {
    if (rows.length == 0) return null;
    return rows[0];
  });
}

function fetchConfig(messageObject) {
  let guildSwitch = configDb(configTables[0])
  .where('guildId', messageObject.guild.id)
  .select('functionSwitch').then(rows => {
    if (rows.length > 0) return [rows[0]['functionSwitch'], false];
    else {
      return [config.defaultPermissionBitfield, true];
    }
  });
  let channelSwitch = configDb(configTables[1])
  .where('guildId', messageObject.guild.id)
  .andWhere('channelId', messageObject.channel.id)
  .select('functionSwitch').then(rows => {
    if (rows.length > 0) return [rows[0]['functionSwitch'], false];
    else {
      return [config.defaultPermissionBitfield, true];
    }
  });
  let reaction = configDb(configTables[1])
  .where('guildId', messageObject.guild.id)
  .andWhere('channelId', messageObject.channel.id)
  .select('reaction').then(rows => {
    if (rows.length > 0) return rows[0]['reaction'];
    else {
      return config.defaultReaction;
    }
  });
  return Promise.all([guildSwitch , channelSwitch, reaction]);
}

function toCacheDB(data){
  cacheDb(cacheTables[0]).insert([data]).then(()=>{});
}

function toConfigDB(messageObject, data ,isGlobal = false) {
  if (isGlobal) {
    if (messageObject.guildFunctionIsDefault){
      let writeData = {
        "guildId" : messageObject.guild.id,
        "functionSwitch" : config.defaultPermissionBitfield
      };
      Object.keys(data).forEach(key => {
        writeData[key] = data[key];
      });
      configDb(configTables[0]).insert([writeData]).then(()=>{});
    }
    else
      configDb(configTables[0])
      .where('guildId', messageObject.guild.id)
      .update(data)
      .then(()=>{});
  }
  else {
    if (messageObject.channelFunctionIsDefault) {
      let writeData = {
        "guildId" : messageObject.guild.id,
        "channelId" : messageObject.channel.id,
        "functionSwitch" : config.defaultPermissionBitfield,
        "reaction" : config.defaultReaction
      }
      Object.keys(data).forEach(key => {
        writeData[key] = data[key];
      });
      configDb(configTables[1]).insert([writeData]).then(()=>{});
    }
    else
      configDb(configTables[1])
      .where('guildId', messageObject.guild.id)
      .andWhere('channelId', messageObject.channel.id)
      .update(data)
      .then(()=>{});
  }
}

function updateCurrentPage(reactionObject) {
  cacheDb('cacheMsg')
  .where('sourceChannelId', reactionObject.message.channel.id)
  .andWhere('replyId', reactionObject.message.id)
  .update({ currentPage: reactionObject.cacheData.currentPage })
  .then(()=>{});
}

function deleteCacheDBData(cacheData) {
  cacheDb('cacheMsg')
  .where('sourceChannelId', cacheData.sourceChannelId)
  .andWhere('replyId', cacheData.replyId)
  .del().then(()=>{});
}

async function setEmbedMsgCache(interaction) {
  let cacheKey = 'cacheMsg_' + interaction.message.id + '_' + interaction.message.channel.id;
  if (!interaction.isDm) {
    cacheKey += '_' + interaction.message.channel.guild.id;
  }
  interaction.cacheData = dbCache.get(cacheKey);
  if (interaction.cacheData != null) return;

  interaction.cacheData = await fetchCache(interaction.message);
  if(interaction.cacheData != null) return;
  //Recover data from post
  let pageValue;
  interaction.message.components[0].components.forEach(button => {
  if((button.style == 'SECONDARY') && button.disabled)
    pageValue = button.label;
  });
  //Extracting page values
  pageValue = (pageValue == null) ? ([ 1,1 ]) : pageValue.split('/');
  pageValue[0] = parseInt(pageValue[0], 10);
  pageValue[1] = parseInt(pageValue[1], 10);
  //Setting fixed page value if an error occurred
  if((pageValue[0] < 1) || (pageValue[1] < 1)) pageValue = [ 1,1 ];
  if(pageValue[0] > pageValue[1]) pageValue[0] = 1;
  interaction.cacheData =  {
    time: new Date(),
    sourceId: interaction.message.id,
    sourceUserId: interaction.message.author.id,
    sourceTimestamp: new Date(),
    sourceContent: interaction.message.embeds[0].url,
    sourceChannelId: interaction.channel.id,
    replyId: interaction.message.id,
    pageCount: pageValue[1],
    currentPage: pageValue[0],
    type: webIcon2Types[interaction.message.embeds[0].author.iconURL],
    sourceGuildId: interaction.guild.id
  }
}

function getManagerRole(guildId) {
  return configDb(configTables[2])
  .where( 'guildId', guildId )
  .select('roleId')
  .then(rows => {
    let roleIds = [];
    rows.forEach((row) => {
      roleIds.push(row.roleId);
    });
    return roleIds;
  });
}

function managerRoleHas(interaction) {
  return configDb(configTables[2])
  .where('guildId', interaction.guild.id)
  .andWhere('roleId', interaction.options.get('role').value)
  .then(rows => {
    return rows.length > 0;
  });
}

function managerRoleDb(interaction, isAdd, targetRole) {
  if(!isAdd) {
    return configDb(configTables[2])
    .where('guildId', interaction.guild.id )
    .andWhere('roleId', targetRole)
    .del().then((result)=>{return result});

  }
  return configDb(configTables[2]).insert([{
    'guildId': interaction.guild.id,
    'roleId': targetRole
  }]).then((result)=>{return result});
}

module.exports = {
  fetchCache,
  fetchConfig,
  toCacheDB,
  toConfigDB,
  updateCurrentPage,
  deleteCacheDBData,
  setEmbedMsgCache,
  getManagerRole,
  managerRoleHas,
  managerRoleDb
};
