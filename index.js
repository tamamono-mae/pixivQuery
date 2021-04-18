const npath = require('path');
const Discord = require("discord.js");
const winston = require('winston');
const config = require("../token/config3.json");
//const p = require("./pipProc.js");
//const q = require("./query.js");
//const a = require("./app.js");
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

client.login(config.BOT_TOKEN);

client.on("message", function(srcMessage) {
  srcMessage.isDm = (srcMessage.channel.type == 'dm');
  srcMessage.isText = (srcMessage.channel.type == 'text');
  srcMessage.isMsgObj = true;
  if (srcMessage.author.bot || !(srcMessage.isDm || srcMessage.isText)) return;
  if (srcMessage.attachments.array().length == 0) {
    arch.setConfig(srcMessage).then(() => {
      arch.msgRouter(srcMessage);
    });
  } else {
    arch.setConfig(srcMessage).then(() => {
      arch.attachmentRouter(srcMessage);
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
    arch.reactionRouter(messageReaction);
  }).then(() => {
    const time = new Date() - start;
    console.log(time);
  });

});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg')
  .where('sourceChannelId', message.channel.id)
  .andWhere('replyId', message.id).del().then(()=>{});
});
