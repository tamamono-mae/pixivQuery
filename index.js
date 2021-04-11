const npath = require('path');
const Discord = require("discord.js");
const winston = require('winston');
const config = require("../token/config3.json");
const p = require("./pipProc.js");
const q = require("./query.js");
const a = require("./app.js");
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
    new winston.transports.File({ filename: npath.join(__dirname, config.pathToLog) })
  ],
});
const client = new Discord.Client();
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

function turnPage(entry, messageReaction, isForward) {
  q.pixivQuery(
    urlDump(entry.sourceContent)['data'],
    entry.currentPage+pageOffset(isForward))
    .then(result => {
    messageReaction.message.edit(q.query2msg(result,urlDump(entry.sourceContent)['website']));
  });
  cacheDb('cacheMsg')
  .where('sourceChannel', messageReaction.message.channel.id)
  .andWhere('replyId', messageReaction.message.id)
  .update({
    currentPage: entry.currentPage+pageOffset(isForward)
  }).then(()=>{});
}

client.login(config.BOT_TOKEN);

client.on("message", function(srcMessage) {
  var is_dm = srcMessage.channel.type == 'dm';
  var isText = srcMessage.channel.type == 'text';
  //if (srcMessage.author.bot || !permissionCheck(srcMessage, 85056)) return;
  if (srcMessage.author.bot || !(is_dm || isText)) return;
  //if (!message.content.startsWith(config.prefix) && !is_dm) return;
  //var msgbody = (is_dm) ? message.content : message.content.slice(config.prefix.length);
  if (srcMessage.attachments.array().length == 1) {
    let result = {
      "opCode": 'imgSearch',
      "varMap": {},
      "data": {
        "url": srcMessage.attachments.array()[0]['attachment']
      },
      "dstTable": ['cacheMsg']
    }; //result = decodedInstruction
    let permissionUserResult = (isText) ?
      p.permissionCheckUser(result['opCode'], srcMessage, '0') :
      p.permissionCheckUserDM(result['opCode']);
    let permissionBotResult = (isText) ?
      p.permissionCheckBot(result['opCode'], srcMessage, 0xFF) :
      [true , false];
    let conditionResult = p.conditionCheck(result['opCode'], srcMessage);
    Promise.all([result, permissionUserResult, permissionBotResult, conditionResult])
    .then(resultAry => {
      let [result, permissionUserResult, permissionBotResult, conditionResult] = resultAry;
      if (! (permissionUserResult & permissionBotResult[0] & conditionResult) ) {
        if (! permissionUserResult ) throw new Error("User permission denied");
        if (! permissionBotResult[0] ) throw new Error("Function " + result['opCode'] + " disabled");
        if (! conditionResult ) throw null;
      }else{
        result['manageMessages'] = permissionBotResult[1];
        return result;
      };
    }).then((decodedInstruction) => {
      var dbLog = {
        time: Date.now(),
        sourceId: srcMessage.id,
        sourceUserId: srcMessage.author.id,
        sourceTimestamp: srcMessage.createdTimestamp,
        sourceContent: srcMessage.content,
        sourceChannel: srcMessage.channel.id,
        type: 'Image Search'
      };
      if (srcMessage.guild != null) dbLog['sourceGuild'] = srcMessage.guild.id;
      return a.urlSearch(decodedInstruction, srcMessage, dbLog, cacheDb)
      .then(result => {
        p.writeBack(
          decodedInstruction.opCode,
          cacheDb,
          decodedInstruction.dstTable[0],
          result.dbLog,
          srcMessage
        );
        result.logger.type = 'Image Search';
        if (decodedInstruction.manageMessages)
          client.channels.cache.get(dbLog.sourceChannel)
          .messages.cache.get(dbLog.sourceId).delete();
        return result.logger;
      })
    }).then(logInfo => {
      logger.info(logInfo);
    }).catch(e => {
      if(e != null) {
        console.log(e);
        logInfo = {
          sourceId: srcMessage.id,
          sourceUserId: srcMessage.author.id,
          sourceTimestamp: srcMessage.createdTimestamp,
          sourceContent: srcMessage.content,
          sourceChannel: srcMessage.channel.id,
          error: e.message
        }
        if (isText)
          logInfo['sourceGuild'] = srcMessage.guild.id;
        logger.info(logInfo);
      }
    });
  }
  else if (srcMessage.content != null) {
    p.instructionDecode(srcMessage.content).then((result) => {
      let permissionUserResult = (isText) ?
        p.permissionCheckUser(result['opCode'], srcMessage, '0') :
        p.permissionCheckUserDM(result['opCode']);
      let permissionBotResult = (isText) ?
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
        result['manageMessages'] = permissionBotResult[1];
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
        case 'getImageInfos':
          dbLog['type'] = 'Reply';
          return a.getImageInfos(
            decodedInstruction, srcMessage, dbLog, cacheDb
          )
          .then(result => {
            p.writeBack(
              decodedInstruction.opCode,
              cacheDb,
              decodedInstruction.dstTable[0],
              result.dbLog,
              srcMessage
            );
            return result.logger;
          });
          /*
          return q.pixivQuery(decodedInstruction.data.pixivID, 1).then(result => {
            if (!result) throw new Error('meta-preload-data not found!');
            passResult = result;
            return result;
          }).then(result => {
            if (decodedInstruction.manageMessages) srcMessage.suppressEmbeds(true);
            return srcMessage.channel.send(q.query2msg(result,decodedInstruction.data.website));
          }).then(message => {
            if (passResult.pageCount > 1)
              message.react('⏮️');
            dbLog['replyId'] = message.id;
            dbLog['pageCount'] = passResult.pageCount;
            dbLog['currentPage'] = 1;
            return message;
          }).then(message => {
            message.react('⭐');
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
          */
          break;
        case 'urlSearch':
          dbLog['type'] = 'URL Search';
          return a.urlSearch(decodedInstruction, srcMessage, dbLog, cacheDb)
          .then(result => {
            p.writeBack(
              decodedInstruction.opCode,
              cacheDb,
              decodedInstruction.dstTable[0],
              result.dbLog,
              srcMessage
            );
            if (decodedInstruction.manageMessages)
              client.channels.cache.get(dbLog.sourceChannel)
              .messages.cache.get(dbLog.sourceId).delete();
            //result['logger']['type'] = 'URL Search';
            return result.logger;
          })

          break;
        case 'moduleSwitch':
          dbLog['type'] = 'Config';
          passResult = {};
          return p.readFunctionSwitch(decodedInstruction['dstTable'], srcMessage)
          .then((functionSwitchArr) => {
            let [guildSwitch , channelSwitch] = functionSwitchArr;
            decodedInstruction.data.operation =
            (decodedInstruction.data.operation.match(/enable/i) != null);
            if (decodedInstruction.data.operation ==
              ((
                ((guildSwitch & channelSwitch) >> p.permissionOpCode[decodedInstruction.data.botModule]['bit'] & 1)
              ) == 1)) {
                a.replyConfigMessage(
                  srcMessage,
                  'No modification made',
                  config.deleteMessageDelay
                );
                throw new Error('No modification made');
              }
            else return (decodedInstruction.data.isGlobal ?
              {
                "table": decodedInstruction.dstTable[0],
                "data": {
                  "functionSwitch" :(
                    guildSwitch ^ (1 << p.permissionOpCode[decodedInstruction.data.botModule]['bit'])
                  )
                },
                "isGlobal": decodedInstruction.data.isGlobal
              } :
              {
                "table": decodedInstruction.dstTable[1],
                "data": {
                  "functionSwitch" :(
                    channelSwitch ^ (1 << p.permissionOpCode[decodedInstruction.data.botModule]['bit'])
                  )
                },
                "isGlobal": decodedInstruction.data.isGlobal
              }
            );
          }).then(dbWrite => {
            a.replyConfigMessage(
              srcMessage,
              decodedInstruction.data.botModule +
              ((decodedInstruction.data.operation) ?
              ' 🇴 🇳' : ' 🇴 🇫 🇫'),
              config.deleteMessageDelay
            );
            p.writeBack(
              decodedInstruction.opCode,
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
        case 'setReaction':
          dbLog['type'] = 'Config';
          return p.readReaction(decodedInstruction['dstTable'], srcMessage)
          .then(reaction => {
            if (decodedInstruction.data.reaction == reaction) {
              a.replyConfigMessage(
                srcMessage,
                'No modification made',
                config.deleteMessageDelay
              );
              throw new Error('No modification made');
            }
            else return {
              "table": decodedInstruction.dstTable[0],
              "data": {
                "reaction" : decodedInstruction.data.reaction
              }
            };
          }).then(dbWrite => {
            a.replyConfigMessage(
              srcMessage,
              dbWrite.data.reaction,
              config.deleteMessageDelay
            );
            p.writeBack(
              decodedInstruction.opCode,
              configDb,
              dbWrite.table,
              dbWrite.data,
              srcMessage
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
        case 'help':
          dbLog['type'] = 'Help';
          srcMessage.author.send('Hi');
          throw 'OK';
      }
    }).then(logInfo => {
      logger.info(logInfo);
    }).catch(e => {
      if(e != null) {
        console.log(e);
        logInfo = {
          sourceId: srcMessage.id,
          sourceUserId: srcMessage.author.id,
          sourceTimestamp: srcMessage.createdTimestamp,
          sourceContent: srcMessage.content,
          sourceChannel: srcMessage.channel.id,
          error: e.message
        }
        if (isText)
          logInfo['sourceGuild'] = srcMessage.guild.id;
        logger.info(logInfo);
      }
    });
  }
});

client.on('ready', () => {
  /*
  cacheDb('cacheMsg').select('sourceChannel').then(rows => {
    var channels = [];
    $.each(rows, function(i, el){
      if($.inArray(el['sourceChannel'], channels) === -1)
        channels.push(el['sourceChannel']);
    });
    channels.forEach(channel =>{
      var ch = client.channels.cache.get(channel);
      client.channels.fetch(channel);
      cacheDb('cacheMsg').where('sourceChannel', channel).select('sourceId').then(rows => {
        var messages = [];
        $.each(rows, function(i, el){
          if($.inArray(el['sourceId'], messages) === -1)
            messages.push(el['sourceId']);
        });
        messages.forEach(message =>
          ch.messages.fetch(message)
        );
      })
    });
  })
  */
  setInterval(( () => {
    cacheDb('cacheMsg').where('sourceTimestamp', '<', Date.now()-86400000).del().then(()=>{});
  } ), 600000);
});

client.on("messageReactionAdd", (messageReaction) => {
  var is_dm = messageReaction.message.channel.type == 'dm';
  var isText = messageReaction.message.channel.type == 'text';
  p.reactionDecode(messageReaction).then((result) => {
    let permissionUserResult = (isText) ?
      p.permissionCheckUserReaction(result['opCode'], messageReaction) :
      p.permissionCheckUserDM(result['opCode'], true);
    let permissionBotResult = (isText) ?
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
      result['manageMessages'] = permissionBotResult[1];
      return result;
    };
  }).then(decodedInstruction => {
    switch (decodedInstruction.opCode) {
      case 'turnPage':
        return cacheDb('cacheMsg')
        .where('sourceChannel', messageReaction.message.channel.id)
        .andWhere('replyId', messageReaction.message.id)
        .select('sourceUserId', 'sourceContent', 'currentPage')
        .then(rows => {
          turnPage(rows[0], messageReaction, decodedInstruction.data.isNext);
          logInfo = {
            type: decodedInstruction.data.isNext ? 'Next page' : 'Previous page',
            sourceId: messageReaction.message.id,
            sourceUserId: messageReaction.users.cache.array().pop().id,
            sourceTimestamp: Date.now(),
            sourceChannel: messageReaction.message.channel.id
          };
          if (isText)
            logInfo['sourceGuild'] = messageReaction.message.channel.guild.id;
          return logInfo;
        })
        break;
      case 'removeEmbedMsg':
        var sourceUserId;
        return cacheDb('cacheMsg')
        .where('sourceChannel', messageReaction.message.channel.id)
        .andWhere('replyId', messageReaction.message.id)
        .select('sourceId', 'sourceChannel', 'sourceUserId')
        .then(rows => {
          sourceUserId = rows[0]['sourceUserId'];
          let srcmsg = client.channels.cache.get(rows[0]['sourceChannel'])
          .messages.cache.get(rows[0]['sourceId']);
          if (srcmsg != null && decodedInstruction.manageMessages)
            srcmsg.suppressEmbeds(false);
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
          if (isText)
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
      if (isText)
        logInfo['sourceGuild'] = messageReaction.message.guild.id;
      logger.error(logInfo);
    }
  })
});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg')
  .where('sourceChannel', message.channel.id)
  .andWhere('replyId', message.id).del().then(()=>{});
});
