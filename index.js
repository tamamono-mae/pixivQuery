const npath = require('path');
const Discord = require("discord.js");
const winston = require('winston');
const config = require("../token/config3.json");
const p = require("./pipProc.js");
const q = require("./query.js");
const cacheDb = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: "../env/pixivQuery.db"
  },
  useNullAsDefault: true
});
const configDb = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: "../env/pixivQueryConfig.db"
  },
  useNullAsDefault: true
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    //new winston.transports.Console(),
    new winston.transports.File({ filename: npath.join(__dirname, '/pixivQuery.log') })
  ],
});
const client = new Discord.Client();
const functionEnableDefault = 0xFF;
let patt = {
  "pixiv" : /^.*\.pixiv\..*\/(\d+)/i,
  "pixivE": /^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i
};

function pageOffset(isForward){
  return isForward ? 1 : -1;
}

function urlDump(msg) {
  if (msg.match(patt['pixiv']))
    return { "data" :msg.match(patt['pixiv'])[1] , "website": 'pixiv'};
  if (msg.match(patt['pixivE']))
    return { "data" :msg.match(patt['pixivE'])[1] , "website": 'pixiv'};
  return null;
}

function permissionCheck(messageObject, permission = 8192){
  return messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(permission);
}

function pageSwitch(entry, messageReaction, isForward) {
  q.pixivQuery(
    urlDump(entry.sourceContent)['data'],
    entry.currentPage+pageOffset(isForward))
    .then(result => {
    messageReaction.message.edit(q.query2msg(result,urlDump(entry.sourceContent)['website']));
  });
  cacheDb('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id)
  .update({
    currentPage: entry.currentPage+pageOffset(isForward)
  }).then(()=>{});
}

client.login(config.BOT_TOKEN);

client.on("message", function(srcMessage) {
  //console.log(p.permissionCheckBot("imgQuery", srcMessage, 0xF));
  //console.log(permissionCheck(srcMessage) ? 4096:0);
  //console.log(srcMessage.author.id);
  var is_dm = srcMessage.channel.type == 'dm';
  //if (srcMessage.author.bot || !permissionCheck(srcMessage, 85056)) return;
  if (srcMessage.author.bot) return;
  //if (!message.content.startsWith(config.prefix) && !is_dm) return;
  //var msgbody = (is_dm) ? message.content : message.content.slice(config.prefix.length);
  if (srcMessage.content) {
    p.instructionDecode(srcMessage.content).then((result) => {
      let permissionUserResult = (!is_dm) ?
        p.permissionCheckUser(result['opCode'], srcMessage, srcMessage.author.id) :
        p.permissionCheckUserDM(result['opCode']);
      let permissionBotResult = (!is_dm) ?
        p.permissionCheckBot(result['opCode'], srcMessage, 0xFF) :
        [true , false];
      let conditionResult = p.conditionCheck(result['opCode'], srcMessage);
      return Promise.all([result, permissionUserResult, permissionBotResult, conditionResult]);
    }).then(resultAry => {
      let [result, permissionUserResult, permissionBotResult, conditionResult] = resultAry;
      if (! (permissionUserResult & permissionBotResult[0] & conditionResult) ) {
        if (! permissionUserResult ) throw new Error("User permission denied");
        if (! permissionBotResult[0] ) throw new Error("Function " + result['opCode'] + " disabled");
        if (! conditionResult ) throw null;
      }else{
        result['textManageable'] = permissionBotResult[1];
        return result;
      };
    }).then((decodedInstruction) => {
      var dbLog = {
        time: Date.now(),
        sourceId: srcMessage.id,
        sourceUserId: srcMessage.author.id,
        sourceTimestamp: srcMessage.createdTimestamp,
        sourceContent: srcMessage.content,
        sourceChannel: srcMessage.channel.id
      };
      if (srcMessage.guild != null) dbLog['sourceGuild'] = srcMessage.guild.id;

      switch (decodedInstruction.opCode) {
        case 'textQuery':
          dbLog['type'] = 'Reply';
          passResult = {};
          return q.pixivQuery(decodedInstruction.data.pixivID, 1).then(result => {
            if (!result) throw new Error('meta-preload-data not found!');
            passResult = result;
            return result;
          }).then(result => {
            if (decodedInstruction.textManageable) srcMessage.suppressEmbeds(true);
            return srcMessage.channel.send(q.query2msg(result,decodedInstruction.data.website));
          }).then(message => {
            if (passResult.pageCount > 1)
              message.react('⏮️');
            dbLog['replyId'] = message.id;
            dbLog['pageCount'] = passResult.pageCount;
            dbLog['currentPage'] = 1;
            return message;
          }).then(message => {
            message.react('👍');
            return message;
          }).then(message => {
            if (passResult.pageCount > 1)
              message.react('⏭️');
            return message;
          }).then(message => {
            message.react('🗑️');
            return message;
          }).then((message) => {
            p.writeBack(
              decodedInstruction.opCode,
              cacheDb,
              decodedInstruction.dstTable[0],
              dbLog,
              message
            );
            return {
              type:'Query',
              sourceId: dbLog.sourceId,
              sourceUserId: dbLog.sourceUserId,
              sourceTimestamp: dbLog.sourceTimestamp,
              sourceContent: dbLog.sourceContent,
              sourceChannel: dbLog.sourceChannel,
              sourceGuild: dbLog.sourceGuild,
              replyContent: srcMessage.embeds[0]
            }
          })
          break;
        case 'urlQuery':
          dbLog['type'] = 'Reply';
          passResult = {};

          break;
        case 'moduleSwitch':
          dbLog['type'] = 'Config';
          passResult = {};

          return p.readFunctionEnable(decodedInstruction['dstTable'], srcMessage)
          .then((functionEnableArr) => {
            let [guildEnable , channelEnable] = functionEnableArr;
            if ((decodedInstruction.data.operation.match(/enable/i) != null)
             == ((((guildEnable & channelEnable) >> p.returnBit(decodedInstruction.data.botModule) & 1)) == 1))
             throw new Error('No modification made');
            else return (decodedInstruction.data.isGlobal ?
              {
                "table": decodedInstruction.dstTable[0],
                "data": {"functionEnable" :(guildEnable ^ (1 << p.returnBit(decodedInstruction.data.botModule)))},
                "isGlobal": decodedInstruction.data.isGlobal
              } :
              {
                "table": decodedInstruction.dstTable[1],
                "data": {"functionEnable" :(channelEnable ^ (1 << p.returnBit(decodedInstruction.data.botModule)))},
                "isGlobal": decodedInstruction.data.isGlobal
              }
            );
          }).then(dbWrite => {
            p.writeBack(decodedInstruction.opCode,
              configDb,
              dbWrite.table,
              dbWrite.data,
              srcMessage,
              {"isGlobal" : dbWrite.isGlobal}
            );
            return {
              type:'Config',
              sourceId: dbLog.sourceId,
              sourceUserId: dbLog.sourceUserId,
              sourceTimestamp: dbLog.sourceTimestamp,
              sourceContent: dbLog.sourceContent,
              sourceChannel: dbLog.sourceChannel,
              sourceGuild: dbLog.sourceGuild,
              replyContent: ""
            }
          });
      }
    }).then(logInfo => {
      logger.info(logInfo);
    }).catch(e => {
      if(e != null) {
        console.log(e);
        logger.info({
          sourceId: srcMessage.id,
          sourceUserId: srcMessage.author.id,
          sourceTimestamp: srcMessage.createdTimestamp,
          sourceContent: srcMessage.content,
          sourceChannel: srcMessage.channel.id,
          sourceGuild: srcMessage.guild.id,
          error: e.message
        });
      }
    });
  }
});

client.on('ready', () => {
  setInterval(( () => {
    cacheDb('cacheMsg').where('sourceTimestamp', '<', Date.now()-86400000).del().then(()=>{});
  } ), 600000);
});

client.on("messageReactionAdd", (messageReaction) => {
  var is_dm = messageReaction.message.channel.type == 'dm';
  p.reactionDecode(messageReaction).then((result) => {
    let permissionUserResult = (!is_dm) ?
      p.permissionCheckUserReaction(result['opCode'], messageReaction) :
      p.permissionCheckUserDM(result['opCode']);
    let permissionBotResult = (!is_dm) ?
      p.permissionCheckBot(result['opCode'], messageReaction.message) :
      [true , false];
    let conditionResult = p.conditionCheck(result['opCode'], messageReaction);
    return Promise.all([result, permissionUserResult, permissionBotResult, conditionResult]);
  }).then(resultAry => {
    let [result, permissionUserResult, permissionBotResult, conditionResult] = resultAry;
    if (
      permissionBotResult[1] &&
      messageReaction.count > 1 &&
      result.opCode != 'removeEmbedMsg'
      )
      messageReaction.users.remove(messageReaction.users.cache.array().pop());
    if (! (permissionUserResult & permissionBotResult[0] & conditionResult) ) {
      if (! permissionUserResult ) throw new Error("Permission denied");
      if (! permissionBotResult[0] ) throw new Error("Function " + result['opCode'] + " disabled");
      if (! conditionResult ) throw null;
    }else{
      result['textManageable'] = permissionBotResult[1];
      return result;
    };
  }).then(decodedInstruction => {
    switch (decodedInstruction.opCode) {
      case 'pageSwitch':
        return cacheDb('cacheMsg')
        .where('sourceChannel', messageReaction.message.channel.id)
        .andWhere('replyId', messageReaction.message.id)
        .select('sourceUserId', 'sourceContent', 'currentPage')
        .then(rows => {
          pageSwitch(rows[0], messageReaction, decodedInstruction.data.isNext);
          logInfo = {
            type: decodedInstruction.data.isNext ? 'Next page' : 'Previous page',
            sourceId: messageReaction.message.id,
            sourceUserId: messageReaction.users.cache.array().pop().id,
            sourceTimestamp: Date.now(),
            sourceChannel: messageReaction.message.channel.id
          };
          if (!is_dm)
            logInfo['sourceGuild'] = messageReaction.message.channel.guild.id;
          return logInfo;
        })
        break;
      case 'removeEmbedMsg':
        var sourceUserId;
        return cacheDb('cacheMsg')
        .where('sourceChannel', messageReaction.message.channel.id)
        .andWhere('replyId', messageReaction.message.id)
        .select('sourceUserId')
        .then(rows => {
          sourceUserId = rows[0]['sourceUserId'];
          return messageReaction.message.delete().then(message => {
            return message;
          })
        }).then(message => {
          cacheDb('cacheMsg')
          .where('sourceChannel', message.channel.id)
          .andWhere('replyId', message.id)
          .del().then(()=>{});
          logInfo = {
            type:'Delete',
            sourceId: message.id,
            sourceUserId: sourceUserId,
            sourceTimestamp: Date.now(),
            sourceContent: message.embeds[0],
            sourceChannel: message.channel.id
          };
          if (!is_dm)
            logInfo['sourceGuild'] = message.channel.guild.id;
          return logInfo;
        });
        break;
      default:
    }
  }).then(logInfo => {
    logger.info(logInfo);
  }).catch(e => {
    if(e != null) {
      console.log(e);
      logInfo = {
        sourceId: messageReaction.message.id,
        sourceUserId:  messageReaction.users.cache.array().pop(),
        sourceTimestamp: Date.now(),
        sourceChannel: messageReaction.message.channel.id,
        error: e.message
      };
      if (!is_dm)
        logInfo['sourceGuild'] = messageReaction.message.guild.id;
      logger.error(logInfo);
    }
  })
});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg').where('sourceChannel', message.channel.id).andWhere('replyId', message.id).del().then(()=>{});
});
