const config = require(require("./shareData.js").configPath);
const configTables = ['guildFunction', 'channelFunction'];
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
      var writeData = {
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
      var writeData = {
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

async function setEmbedMsgCache(client) {
  var cacheKey = 'cacheMsg_' + client.message.id + '_' + client.message.channel.id;
  if (!client.isDm) {
    cacheKey += '_' + client.message.channel.guild.id;
  }
  if (dbCache.get(cacheKey) != null) {
    client.cacheData = dbCache.get(cacheKey);
    return;
  }
  client.cacheData = await fetchCache(client.message);
}

module.exports = {
  fetchCache,
  fetchConfig,
  toCacheDB,
  toConfigDB,
  updateCurrentPage,
  deleteCacheDBData,
  setEmbedMsgCache
};
