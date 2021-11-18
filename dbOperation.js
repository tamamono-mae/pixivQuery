const config = require(require("./shareData.js").configPath);
const configTables = ['guildFunction', 'channelFunction', 'guildManager' ];
const cacheTables = ['cacheMsg', 'imgurImage'];

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

function fetchCache(dataObject) {
  return cacheDb('cacheMsg')
  .where('sourceChannelId', dataObject.channel.id)
  .andWhere('replyId', dataObject.id)
  .then(rows => {
    if (rows.length == 0) return null;
    return rows[0];
  });
}

function fetchConfig(dataObject) {
  let guildSwitch = configDb(configTables[0])
  .where('guildId', dataObject.guild.id)
  .select('functionSwitch').then(rows => {
    if (rows.length > 0) return [rows[0]['functionSwitch'], false];
    else {
      return [config.defaultPermissionBitfield, true];
    }
  });
  let channelSwitch = configDb(configTables[1])
  .where('guildId', dataObject.guild.id)
  .andWhere('channelId', dataObject.channel.id)
  .select('functionSwitch').then(rows => {
    if (rows.length > 0) return [rows[0]['functionSwitch'], false];
    else {
      return [config.defaultPermissionBitfield, true];
    }
  });
  let reaction = configDb(configTables[1])
  .where('guildId', dataObject.guild.id)
  .andWhere('channelId', dataObject.channel.id)
  .select('reaction').then(rows => {
    if (rows.length <= 0) return config.defaultReaction;
    if (rows[0].reaction.length < 10) return rows[0].reaction;
    //need to re-verify
    let targetEmoji = dataObject.guild.emojis.cache.get(rows[0].reaction);
    //Fetch if emoji been add after application start.
    if (targetEmoji == null) return dataObject.guild.emojis.fetch(rows[0].reaction).then(emojiObj => {
      return rows[0]['reaction'];
    }).catch(e => {
      console.info('[ info ] ' + e.message);
      //Remove invalid data
      configDb(configTables[1])
      .where('guildId', dataObject.guild.id)
      .andWhere('channelId', dataObject.channel.id)
      .del().then(()=>{});
      return config.defaultReaction;
    });
  });
  return Promise.all([guildSwitch , channelSwitch, reaction]);
}

function toCacheDB(data){
  cacheDb(cacheTables[0]).insert([data]).then(()=>{});
}

function toConfigDB(dataObject, data ,isGlobal = false) {
  if (isGlobal) {
    if (dataObject.guildFunctionIsDefault){
      let writeData = {
        "guildId" : dataObject.guild.id,
        "functionSwitch" : config.defaultPermissionBitfield
      };
      Object.keys(data).forEach(key => {
        writeData[key] = data[key];
      });
      configDb(configTables[0]).insert([writeData]).then(()=>{});
    }
    else
      configDb(configTables[0])
      .where('guildId', dataObject.guild.id)
      .update(data)
      .then(()=>{});
  }
  else {
    if (dataObject.channelFunctionIsDefault) {
      let writeData = {
        "guildId" : dataObject.guild.id,
        "channelId" : dataObject.channel.id,
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
      .where('guildId', dataObject.guild.id)
      .andWhere('channelId', dataObject.channel.id)
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
  let getPv = function(pV){
    let rtval = pV.split('/');
    rtval[0] = parseInt(rtval[0], 10);
    rtval[1] = parseInt(rtval[1], 10);
    //Setting fixed page value if an error occurred
    if((rtval[0] < 1) || (rtval[1] < 1)) return [ 1,1 ];
    if(rtval[0] > rtval[1]) pageValue[0] = 1;
    return rtval;
  }
  pageValue = (pageValue == null) ? ([ 1,1 ]) : getPv(pageValue);
  //Extracting author id of user.
  let userId = interaction.message.content.split("\n")[1];
  userId = userId.split(")");
  userId = userId[userId.length - 2];
  userId = userId.split("(");
  userId = userId[userId.length - 1];
  interaction.cacheData =  {
    time: new Date(),
    sourceId: interaction.message.id,
    sourceUserId: userId,
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

function fetchImageCache(url) {
  return cacheDb(cacheTables[1])
  .where('source', url)
  .select('url')
  .then(rows => {
    if (rows.length == 0) return null;
    return rows[0].url;
  });
}

function writeImageCache(data) {
  cacheDb(cacheTables[1]).insert([data]).then(()=>{});
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
  managerRoleDb,
  fetchImageCache,
  writeImageCache
};
