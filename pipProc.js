/*
sudo mount -t vboxsf -o uid=$UID,gid=$(id -g) pixivQuery pixivQuery
sudo mount -t vboxsf -o uid=$UID,gid=$(id -g) env env
sudo mount -t vboxsf -o uid=$UID,gid=$(id -g) token token
cd pixivQuery
*/
const config = require("../token/config3.json");
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

let textInstructionSet = {
  "pixiv" : {
    "patt": /^.*\.pixiv\..*\/(\d+)/i ,
    "opCode": "getImageInfos",
    "varMap": {
      "pixivID": 1
    },
    "varExt": {
      "website": "pixiv"
    },
    "dstTable": ['cacheMsg']
  },
  "pixivE": {
    "patt": /^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i ,
    "opCode": "getImageInfos",
    "varMap": {
      "pixivID": 1
    },
    "varExt": {
      "website": "pixiv"
    },
    "dstTable": ['cacheMsg']
  },
  "help": {
    "patt": new RegExp(`^${config.prefix} help`,'i'),
    "opCode": 'help',
    "varMap": {}
  },
  "urlSearch": {
    "patt": /^(https|http):\/\/(.+)(.jpg|.png)/i ,
    "opCode": "urlSearch",
    "varMap": {
      "url": 0
    },
    "dstTable": ['cacheMsg']
  },
  "setReaction": {
    "patt": new RegExp(`^${config.prefix} setReaction (..)`,'i'),
    "opCode": 'setReaction',
    "varMap": {
      "reaction": 1
    },
    "dstTable": ['channelFunction']
  },
  "status": {
    "patt": new RegExp(`^${config.prefix} status`,'i'),
    "opCode": 'status',
    "varMap": {}
  },
  "moduleSwitch": {
    "patt": new RegExp(`^${config.prefix} (.+) (enable|disable)( global)*`,'i'),
    "opCode": 'moduleSwitch',
    "varMap": {
      "botModule": 1,
      "operation": 2,
      "isGlobal": 3
    },
    "dstTable": ['guildFunction', 'channelFunction']
  }
};

let reactionSet = {
  "nextPage": {
    "patt": "⏩" ,
    "opCode": "turnPage",
    "varExt": {
      "isNext": true
    },
    "dstTable": ['cacheMsg']
  },
  "previousPage": {
    "patt": "⏪" ,
    "opCode": "turnPage",
    "varExt": {
      "isNext": false
    },
    "dstTable": ['cacheMsg']
  },
  "removeEmbedMsg": {
    "patt": "🗑️" ,
    "opCode": "removeEmbedMsg",
    "dstTable": ['cacheMsg']
  }
};

let permissionOpCode = {
  /* guildOwner txtmanager originalAuthor is_text everyone*/
  "help" : { perm: 0x1E },
  // 1 1 1 1 0
  "getImageInfos" : { perm: 0x1E , bit: 0 },
  // 1 1 1 1 0
  "urlSearch" : { perm: 0x1F , bit: 1 },
  // 1 1 1 1 1
  "imgSearch" : { perm: 0x1F , bit: 2 },
  // 1 1 1 1 1
  "status": { perm: 0x18 },
  "moduleSwitch": { perm: 0x18 },
  "setReaction": { perm: 0x18 },
  // 1 1 0 0 0
  "removeEmbedMsg": { perm: 0x1C },
  // 1 1 1 0 0
  "turnPage": { perm: 0x1F }
  // 1 1 1 1 1
}

let moduleName = [
  "getImageInfos", "urlSearch", "imgSearch"
]

function writeBack(opCode, dstDb, dstTable, data, messageObject = null, data2pass=null) {
  switch (opCode) {
    case 'getImageInfos':
    case 'urlSearch':
    case 'imgSearch':
      dstDb(dstTable).insert([data]).then(()=>{});
      /*
      logger.info({
        type:'Reply',
        sourceId: data.sourceId,
        sourceUserId: data.sourceUserId,
        sourceTimestamp: data.sourceTimestamp,
        sourceContent: data.sourceContent,
        sourceChannel: data.sourceChannel,
        sourceGuild: data.sourceGuild,
        replyContent: messageObject.embeds[0]
      });
      */
      break;
    case 'setReaction':
      dstDb(dstTable)
      .where('guildId', messageObject.guild.id)
      .andWhere('channelId', messageObject.channel.id)
      .update(data)
      .then(()=>{});
      break;
    case 'moduleSwitch':
      if (data2pass.isGlobal){
        dstDb(dstTable)
        .where('guildId', messageObject.guild.id)
        .update(data)
        .then(()=>{});
      }
      else{
        dstDb(dstTable)
        .where('guildId', messageObject.guild.id)
        .andWhere('channelId', messageObject.channel.id)
        .update(data)
        .then(()=>{});
      }
      /*
      logger.info({
        type:'Config',
        sourceId: messageObject.id,
        sourceUserId: messageObject.author.id,
        sourceTimestamp: messageObject.createdTimestamp,
        sourceContent: messageObject.content,
        sourceChannel: messageObject.channel.id,
        sourceGuild: messageObject.guild.id,
      });
      */
      break;
  }
}

function conditionCheck (opCode, objectCheck) {
  switch (opCode) {
    case 'getImageInfos':
    case 'urlSearch':
    case 'help':
    case 'status':
    case 'setReaction':
      return true;
    case 'imgSearch':
      return objectCheck.attachments.array()[0]['attachment']
      .match(textInstructionSet.urlSearch.patt) != null;
    case 'moduleSwitch':
      check = false;
      var botModule = objectCheck.content.split(" ")[1];
      for (i=0;i<moduleName.length;i++) {
        if (botModule.match(new RegExp(`^${moduleName[i]}`,'gm')) != null){
          check = true;
          break;
        }
      }
      return check;
    case 'turnPage':
      check = false;
      return cacheDb('cacheMsg')
      .where('sourceChannel', objectCheck.message.channel.id)
      .andWhere('replyId', objectCheck.message.id)
      .select('sourceContent', 'pageCount', 'currentPage')
      .then((rows) => {
        rows.forEach((entry) => {
          if (
            objectCheck.emoji.name == '⏩' &&
            entry.currentPage < entry.pageCount &&
            entry.pageCount > 1 &&
            objectCheck.count > 1)
              check = true;
          if (
            objectCheck.emoji.name == '⏪' &&
            entry.currentPage > 1 &&
            entry.pageCount > 1 &&
            objectCheck.count > 1)
              check = true;
        });
        return check;
      });
      break;

    case 'removeEmbedMsg':
      check = false;
      return cacheDb('cacheMsg')
      .where('sourceChannel', objectCheck.message.channel.id)
      .andWhere('replyId', objectCheck.message.id)
      .select('sourceUserId')
      .then((rows) => {
        rows.forEach((entry) => {
          if (
          objectCheck.users.cache.has(entry.sourceUserId) &&
          objectCheck.emoji.name == '🗑️'
          )
            check = true;
        });
        return check;
      });

      break;

    default:
  }
}

function readReaction(dstTable, messageObject, is_ro = false) {
  return configDb(dstTable[0])
  .where('guildId', messageObject.guild.id)
  .andWhere('channelId', messageObject.channel.id)
  .select('reaction')
  .then(rows => {
    if (rows.length > 0) return rows[0]['reaction'];
    else if (is_ro){
      return config.defaultReaction;
    }
    else {
      return configDb(dstTable[0]).insert([{
        "guildId" : messageObject.guild.id,
        "channelId" : messageObject.channel.id,
        "functionSwitch" : config.defaultPermissionBitfield,
        "reaction" : config.defaultReaction
      }]).then(()=>{
        return config.defaultReaction;
      });
    }
  })
}

function readFunctionSwitch(dstTable, messageObject, is_ro = false) {
  let guildSwitch = configDb(dstTable[0])
  .where('guildId', messageObject.guild.id)
  .then(rows => {
    if (rows.length > 0) return rows[0]['functionSwitch'];
    else if (is_ro){
      return config.defaultPermissionBitfield;
    }
    else {
      return configDb(dstTable[0]).insert([{
        "guildId" : messageObject.guild.id,
        "functionSwitch" : config.defaultPermissionBitfield
      }]).then(()=>{
        return config.defaultPermissionBitfield;
      });
    }
  });
  let channelSwitch = configDb(dstTable[1])
  .where('guildId', messageObject.guild.id)
  .andWhere('channelId', messageObject.channel.id)
  .then(rows => {
    if (rows.length > 0) return rows[0]['functionSwitch'];
    else if (is_ro){
      return config.defaultPermissionBitfield;
    }
    else {
      return configDb(dstTable[1]).insert([{
        "guildId" : messageObject.guild.id,
        "channelId" : messageObject.channel.id,
        "functionSwitch" : config.defaultPermissionBitfield,
        "reaction" : config.defaultReaction
      }]).then(()=>{
        return config.defaultPermissionBitfield;
      });
    }
  });
  return Promise.all([guildSwitch , channelSwitch]);
}

function permissionCheckBot(opCode, messageObject) {
  return readFunctionSwitch(['guildFunction', 'channelFunction'], messageObject, true)
  .then((FunctionSwitchArr) => {
    let [guildSwitch , channelSwitch] = FunctionSwitchArr;
    return ([
      //sendMessage
      (messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(0x4800)
      //moduleEnable
      & ((permissionOpCode[opCode]['bit'] != null) ? (((guildSwitch & channelSwitch) >> permissionOpCode[opCode]['bit']) & 1) : 1)) == 1,
      //manageMessage
      messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(0x2000)
    ]);
  });
}

function permissionCheckUserReaction(opCode, reactionObject) {
  return cacheDb('cacheMsg')
  .where('sourceChannel', reactionObject.message.channel.id)
  .andWhere('replyId', reactionObject.message.id)
  .select('sourceUserId')
  .then((rows) => {
    let authorId = rows[0]['sourceUserId'];
    p = ((reactionObject.message.channel.guild.ownerID == reactionObject.users.cache.array().pop() ? 0x10:0)
      | (reactionObject.message.channel.permissionsFor(reactionObject.users.cache.array().pop()).has(0x2000) ? 0x8:0)
      | (reactionObject.users.cache.has(authorId) ? 0x4:0)
      | 0x3) & permissionOpCode[opCode]['perm'];
    r = 0;
    for(i=0;i<4;i++){
      r = ((p >> i) & 1) | r;
    }
    return (r == 1);
  });
};

function permissionCheckUserDM(opCode, isReaction = false) {
  let p = (isReaction ? 0x5 : 0x1) & permissionOpCode[opCode]['perm'];
  let r = 0;
  for(i=0;i<4;i++){
    r = ((p >> i) & 1) | r;
  }
  return (r == 1);
}

function permissionCheckUser(opCode, messageObject = null, authorId, reactionObject = null) {
  var p;
  if(messageObject != null)
  p = ((messageObject.channel.guild.ownerID == messageObject.author.id ? 0x10:0)
    | (messageObject.channel.permissionsFor(messageObject.author).has(0x2000) ? 0x8:0)
    | (messageObject.author.id == authorId ? 0x4:0)
    | 0x3) & permissionOpCode[opCode]['perm'];
  if(reactionObject != null)
  p = ((reactionObject.message.channel.guild.ownerID == reactionObject.users.cache.array().pop() ? 0x10:0)
    | (reactionObject.message.channel.permissionsFor(reactionObject.users.cache.array().pop()).has(0x2000) ? 0x8:0)
    | (reactionObject.users.cache.has(authorId) ? 0x4:0)
    | 0x3) & permissionOpCode[opCode]['perm'];
  let r = 0;
  for(i=0;i<4;i++){
    r = ((p >> i) & 1) | r;
  }
  return (r == 1);
}

function reactionDecode(messageReaction) {
  return new Promise((resolve, reject) => {
    if(!messageReaction) reject('No instruction!');
    for (i=0;i<Object.keys(reactionSet).length;i++){
      if (messageReaction.emoji.name == Object.values(reactionSet)[i]['patt']){
        data = {};
        if(Object.values(textInstructionSet)[i]['varExt'] != null)
          Object.keys(
            Object.values(reactionSet)[i]['varExt'])
            .forEach((index) => {
              data[index] = Object.values(reactionSet)[i]['varExt'][index];
            }
          );
        resolve({
          "opCode": Object.values(reactionSet)[i]['opCode'],
          "data": data,
          "dstTable": Object.values(reactionSet)[i]['dstTable']
        });
        break;
      }
    }
  });
}

function instructionDecode(msg) {
  return new Promise((resolve, reject) => {
    if(!msg) reject('No instruction!');
    for (i=0;i<Object.keys(textInstructionSet).length;i++){
      if (msg.match(Object.values(textInstructionSet)[i]['patt'])){
        data = {};
        Object.keys(
          Object.values(textInstructionSet)[i]['varMap']).forEach((index) => {
          //data[index] = msg.match(Object.values(textInstructionSet)[i]['patt'])[Object.values(textInstructionSet)[i]['varMap'][index]];
            data[index] = msg.match(Object.values(textInstructionSet)[i]['patt'])[Object.values(textInstructionSet)[i]['varMap'][index]];
            }
          );
        if(Object.values(textInstructionSet)[i]['varExt'] != null)
          Object.keys(
            Object.values(textInstructionSet)[i]['varExt'])
            .forEach((index) => {
              data[index] = Object.values(textInstructionSet)[i]['varExt'][index];
            }
          );
        resolve({
          "opCode": Object.values(textInstructionSet)[i]['opCode'],
          "data": data,
          "dstTable": Object.values(textInstructionSet)[i]['dstTable']
        });
        break;
      }
    }
  });
}

module.exports = {
  permissionOpCode,
  moduleName,
  writeBack,
  conditionCheck,
  readReaction,
  readFunctionSwitch,
  permissionCheckBot,
  permissionCheckUserDM,
  permissionCheckUserReaction,
  permissionCheckUser,
  reactionDecode,
  instructionDecode
};
