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

function pageSwitch(entry, client, messageReaction, isForward, isReactionRemove = false) {
  q.pixivQuery(urlDump(entry.sourceContent)['data'], entry.currentPage+pageOffset(isForward)).then(result => {
    client.channels.cache.get(messageReaction.message.channel.id).messages.fetch(messageReaction.message.id).then(message => {
      message.edit(q.query2msg(result,urlDump(entry.sourceContent)['website']));
    });
  });
  cacheDb('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).update({
    currentPage: entry.currentPage+pageOffset(isForward)
  }).then(()=>{});
  logger.info({
    type: isForward ? 'Next page' : 'Previous page',
    sourceId: messageReaction.message.id,
    sourceUserId: isReactionRemove ? 'Unknown' : messageReaction.users.cache.array().pop().id,
    sourceTimestamp: Date.now(),
    sourceChannel: messageReaction.message.channel.id,
    sourceGuild: messageReaction.message.channel.guild.id,
  });
}

client.login(config.BOT_TOKEN);

client.on("message", function(srcMessage) {
  //console.log(p.permissionCheckBot("imgQuery", srcMessage, 0xF));
  //console.log(permissionCheck(srcMessage) ? 4096:0);
  //console.log(srcMessage.author.id);
  var is_dm = srcMessage.channel.type == 'dm';
  if (srcMessage.author.bot || !permissionCheck(srcMessage, 85056)) return;
  //if (!message.content.startsWith(config.prefix) && !is_dm) return;
  //var msgbody = (is_dm) ? message.content : message.content.slice(config.prefix.length);
  if (srcMessage.content) {
    p.instructionDecode(srcMessage.content).then((result) => {
      let permissionUserResult = p.permissionCheckUser(
        result['opCode'],
        srcMessage,
        srcMessage.author.id
      );
      let permissionBotResult = p.permissionCheckBot(result['opCode'], srcMessage, 0xFF);
      let conditionResult = p.conditionCheck(result['opCode'], srcMessage);
      return Promise.all([result, permissionUserResult, permissionBotResult, conditionResult]);
    }).then(resultAry => {
      let [result, permissionUserResult, permissionBotResult, conditionResult] = resultAry;
      if (! (permissionUserResult & permissionBotResult[0] & conditionResult) ) {
        if (! permissionUserResult ) throw new Error("User permission denied");
        if (! permissionBotResult[0] ) throw new Error("Function " + result['opCode'] + " disabled");
        if (! conditionResult ) throw new Error("Oops !");
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
      if (srcMessage.guild.id) dbLog['sourceGuild'] = srcMessage.guild.id;

      switch (decodedInstruction.opCode) {
        case 'textQuery':
          dbLog['type'] = 'Reply';
          passResult = {};
          q.pixivQuery(decodedInstruction.data.pixivID, 1).then(result => {
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
            dbLog['pageCount'] = decodedInstruction.pageCount;
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
              logger,
              message
            );
          })
          break;
        case 'urlQuery':
          dbLog['type'] = 'Reply';
          passResult = {};

          break;
        case 'moduleSwitch':
          dbLog['type'] = 'Config';
          passResult = {};

          return p.readFunctionEnable(decodedInstruction['dstTable'], srcMessage).then((functionEnableArr) => {
            let [guildEnable , channelEnable] = functionEnableArr;
            if (!(decodedInstruction.data.operation.match(/enable/i) == null)
             == ((((guildEnable & channelEnable) >> p.returnBit(decodedInstruction.data.botModule) & 1)) == 1))
             throw new Error('Not need to access !');
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
              logger,
              srcMessage,
              {"isGlobal" : dbWrite.isGlobal}
            );
          });
      }
    }).catch(e => {
      console.log(e.message);
      logger.info({
        type:'Config',
        sourceId: srcMessage.id,
        sourceUserId: srcMessage.author.id,
        sourceTimestamp: srcMessage.createdTimestamp,
        sourceContent: srcMessage.content,
        sourceChannel: srcMessage.channel.id,
        sourceGuild: srcMessage.guild.id,
        error: e.message
      });
    });
  }
});

client.on('ready', () => {
  setInterval(( () => {
    cacheDb('cacheMsg').where('sourceTimestamp', '<', Date.now()-86400000).del().then(()=>{});
  } ), 600000);
});

client.on("messageReactionAdd", (messageReaction) => {
  /*
  Promise.all([p.conditionCheck('pageSwitch', messageReaction)]).then((result) => {
    let [condition] = result;
    console.log(condition);
  })
  */
  /*
  p.reactionDecode(messageReaction).then((result) => {
    console.log(result);
  })
  */
  //console.log(p.permissionCheckUser('pageSwitch', null, 0, messageReaction));
  cacheDb('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).select('sourceUserId', 'sourceContent', 'pageCount', 'currentPage').then(rows => {
    rows.forEach((entry) => {
      if (messageReaction.users.cache.has(entry.sourceUserId) && messageReaction.emoji.name == '🗑️') {
        client.channels.cache.get(messageReaction.message.channel.id).messages.fetch(messageReaction.message.id).then(message => {
          message.delete();
        });
        cacheDb('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).del().then(()=>{});
        logger.info({
          type:'Delete',
          sourceId: messageReaction.message.id,
          sourceUserId: entry.sourceUserId,
          sourceTimestamp: Date.now(),
          sourceContent:messageReaction.message.embeds[0],
          sourceChannel: messageReaction.message.channel.id,
          sourceGuild: messageReaction.message.channel.guild.id,
        });
      };
      if ((messageReaction.emoji.name == '⏭️' || messageReaction.emoji.name == '⏮️') && entry.pageCount > 1 && messageReaction.count > 1 && permissionCheck(messageReaction.message))
        messageReaction.users.remove(messageReaction.users.cache.array().pop());
      if (messageReaction.emoji.name == '⏭️' && entry.currentPage < entry.pageCount && entry.pageCount > 1 && messageReaction.count > 1) {
        pageSwitch(entry, client, messageReaction, true);
      }
      if (messageReaction.emoji.name == '⏮️' && entry.currentPage > 1 && entry.pageCount > 1 && messageReaction.count > 1) {
        pageSwitch(entry, client, messageReaction, false);
      }
    });
  });
});

client.on("messageReactionRemove", (messageReaction) => {
  cacheDb('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).select('sourceUserId', 'sourceContent', 'pageCount', 'currentPage').then(rows => {
    rows.forEach((entry) => {
      if (messageReaction.emoji.name == '⏭️' && entry.currentPage < entry.pageCount && entry.pageCount > 1 && !permissionCheck(messageReaction.message)) {
        pageSwitch(entry, client, messageReaction, true, true);
      }
      if (messageReaction.emoji.name == '⏮️' && entry.currentPage > 1 && entry.pageCount > 1 && !permissionCheck(messageReaction.message)) {
        pageSwitch(entry, client, messageReaction, false, true);
      }
    });
  });
});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg').where('sourceChannel', message.channel.id).andWhere('replyId', message.id).del().then(()=>{});
});
