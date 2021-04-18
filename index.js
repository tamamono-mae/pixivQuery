const npath = require('path');
const Discord = require("discord.js");
const winston = require('winston');
const config = require("../token/config3.json");
const arch = require("./architecture.js");
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

function loggerArray(logArray) {
  for(var i=0;i<logArray.length;i++){
    logger.info(logArray[i]);
    console.log(logArray[i]);
  }
}

client.login(config.BOT_TOKEN);

client.on("message", function(srcMessage) {
  const start = new Date();
  srcMessage.isDm = (srcMessage.channel.type == 'dm');
  srcMessage.isText = (srcMessage.channel.type == 'text');
  srcMessage.isMsgObj = true;
  if (srcMessage.author.bot || !(srcMessage.isDm || srcMessage.isText)) return;
  if (srcMessage.attachments.array().length == 0) {
    arch.setConfig(srcMessage).then(() => {
      return arch.msgRouter(srcMessage);
    }).then(logArray => {
      loggerArray(logArray);
      const time = new Date() - start;
      console.log(time);
    });
  } else {
    arch.setConfig(srcMessage).then(() => {
      return arch.attachmentRouter(srcMessage);
    }).then(logArray => {
      loggerArray(logArray);
      const time = new Date() - start;
      console.log(time);
    });
  }
});

client.on('ready', () => {
  setInterval(( () => {
    cacheDb('cacheMsg').where('sourceTimestamp', '<', Date.now()-86400000).del().then(()=>{});
  } ), 600000);
});

client.on("messageReactionAdd", (messageReaction) => {
  const start = new Date();
  messageReaction.rts = start;
  messageReaction.isDm = (messageReaction.message.channel.type == 'dm');
  messageReaction.isText = (messageReaction.message.channel.type == 'text');
  messageReaction.isMsgObj = false;
  messageReaction.client = client;
  if (messageReaction.message.author.id != client.user.id) return;

  messageReaction.reactionCurrentUser = messageReaction.users.cache.array();
  messageReaction.reactionCurrentUser = messageReaction.reactionCurrentUser.pop();

  if (messageReaction.reactionCurrentUser.bot) return;
  //if (messageReaction.count > 1) messageReaction.users.remove(messageReaction.reactionCurrentUser);
  arch.setConfig(messageReaction).then(() => {
    arch.setEmbedMsgCache(messageReaction);
    if (messageReaction.cacheData == null) throw null;
  }).then(() => {
    return arch.reactionRouter(messageReaction);
  }).then(logArray => {
    loggerArray(logArray);
    const time = new Date() - start;
    console.log(time);
  });
});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg')
  .where('sourceChannelId', message.channel.id)
  .andWhere('replyId', message.id).del().then(()=>{});
});
