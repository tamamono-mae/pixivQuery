const npath = require('path');
const winston = require('winston');
const config = require(require("./shareData.js").configPath);
const arch = require("./architecture.js");
const { initCmdAll, initCmd } = require("./fn.js");

//Discordjs fix
const { Client, Intents } = require('discord.js');
const client = new Client({
	intents: [
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.DIRECT_MESSAGES
	]
});
//Discordjs fix end
const cacheDb = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: config.pathToCacheDb
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
//const client = new Discord.Client();

function loggerArray(logArray) {
  if (logArray != null)
    for(var i=0;i<logArray.length;i++){
      logger.info(logArray[i]);
      //console.log(logArray[i]);
    }
}

function loggerError(client, e) {
  logInfo = {
    error: e.message,
    sourceId: client.id,
    sourceUserId: ((client.author == null) ? client.user.id : client.author.id),
    sourceTimestamp: client.createdTimestamp,
    sourceContent: client.content,
    sourceChannelId: client.channel.id,
    guildSwitch: client.guildSwitch,
    channelSwitch: client.channelSwitch,
    reaction: client.configReaction
  }
  if (!client.isDm)
    logInfo['sourceGuildId'] = client.guild.id;
  logger.error(logInfo);
}

client.login(config.BOT_TOKEN);

client.on('interactionCreate', function(interaction) {
  const start = new Date();
	interaction.rts = start;
  interaction.isDm = (interaction.channel.type == 'dm');
  interaction.isText = (
    (interaction.channel.type == 'GUILD_TEXT') ||
    (interaction.channel.type == 'GUILD_PUBLIC_THREAD') ||
    (interaction.channel.type == 'GUILD_PRIVATE_THREAD')
  );
  interaction.objType = 'commandInteraction';
  //console.log(interaction.channel);
  if (interaction.user.bot || !(interaction.isDm || interaction.isText)) return;
	arch.setConfig(interaction).then(() => {
		if (interaction.isCommand()) //Command interaction
			return arch.cmdRouter(interaction);
		if (interaction.isButton()) { //Button interaction
			return arch.btnRouter(interaction);
		};
	}).then(logArray => {
		loggerArray(logArray);
		const time = new Date() - start;
		//console.log(time);
	}).catch(e => {
		console.error(e);
		loggerError(interaction, e);
	});
});

client.on("messageCreate", function(srcMessage) {
  const start = new Date();
  srcMessage.isDm = (srcMessage.channel.type == 'dm');
  srcMessage.isText = (
    (srcMessage.channel.type == 'GUILD_TEXT') ||
    (srcMessage.channel.type == 'GUILD_PUBLIC_THREAD') ||
    (srcMessage.channel.type == 'GUILD_PRIVATE_THREAD')
  );
	srcMessage.objType = 'message';
  if (srcMessage.author.bot || !(srcMessage.isDm || srcMessage.isText)) return;
	initCmdAll(client);
	if (Array.from(srcMessage.attachments.values()).length == 0) {
    /*// TODO:
    help增加reaction顯示
    pixiv增加tag欄位
    增加重置設定功能
    增加Reaction全域設定
    */
    arch.setConfig(srcMessage).then(() => {
      return arch.msgRouter(srcMessage);
    }).then(logArray => {
      loggerArray(logArray);
      const time = new Date() - start;
      //console.log(time);
    }).catch(e => {
      console.error(e);
      loggerError(srcMessage, e);
    });
  } else {
    arch.setConfig(srcMessage).then(() => {
      return arch.attachmentRouter(srcMessage);
    }).then(logArray => {
      loggerArray(logArray);
      const time = new Date() - start;
      //console.log(time);
    }).catch(e => {
      console.error(e);
      loggerError(srcMessage, e);
    });
  }
});

client.on('ready', () => {
  console.info(`[ info ] Logged in as ${client.user.tag}!`);
	initCmdAll(client);
  setInterval(( () => {
    cacheDb('cacheMsg').where('sourceTimestamp', '<', Date.now()-86400000).del().then(()=>{});
  } ), 600000);
});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg')
  .where('sourceChannelId', message.channel.id)
  .andWhere('replyId', message.id).del().then(()=>{});
});
