const npath = require('path');
//const Discord = require("discord.js");
//Discord.js new method
//const { Routes } = require('discord-api-types/v9');
const winston = require('winston');
const config = require("../token/config2.json");
const arch = require("./architecture.js");
const initCmdAll = require("./app.js").initCmdAll;
//Discord command add

/*
(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(config.userID, 717423082142433400),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
*/
//Discord command add end
//Discordjs fix
const { Client, Intents } = require('discord.js');
const client = new Client({
	intents: [
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
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
    sourceUserId: client.author.id,
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

client.on('interactionCreate', async interaction => {
  const start = new Date();
  interaction.isDm = (interaction.channel.type == 'dm');
  interaction.isText = (
    (interaction.channel.type == 'GUILD_TEXT') ||
    (interaction.channel.type == 'GUILD_PUBLIC_THREAD') ||
    (interaction.channel.type == 'GUILD_PRIVATE_THREAD')
  );
  interaction.isMsgObj = true;
  //console.log(interaction.channel);
  if (interaction.user.bot || !(interaction.isDm || interaction.isText)) return;
  if (!interaction.isCommand()) return;

  //
  arch.setConfig(interaction).then(() => console.log(interaction));

  /*
  arch.setConfig(srcMessage).then(() => {
    return arch.msgRouter(srcMessage);
  }).then(logArray => {
    loggerArray(logArray);
    const time = new Date() - start;
    console.log(time);
  }).catch(e => {
    console.log(e);
    loggerError(srcMessage, e);
  });
  */

  //console.log(interaction);
  if (interaction.commandName === 'ping') {
    await interaction.reply( {content: 'Pong!', ephemeral: true });
		/*
    console.log(await interaction.reply({ content: 'Pong!', fetchReply: true })
    .then((message) => message.interaction.deleteReply()));
    await interaction.reply('.');
    await interaction.deleteReply();
    // defer == thinking

    await interaction.deferReply({ ephemeral: true })
    .then(console.log);

    await interaction.followUp('test');
		*/

  }

});

client.on("messageCreate", function(srcMessage) {
  const start = new Date();
  srcMessage.isDm = (srcMessage.channel.type == 'dm');
  srcMessage.isText = (
    (srcMessage.channel.type == 'GUILD_TEXT') ||
    (srcMessage.channel.type == 'GUILD_PUBLIC_THREAD') ||
    (srcMessage.channel.type == 'GUILD_PRIVATE_THREAD')
  );
  srcMessage.isMsgObj = true;
  if (srcMessage.author.bot || !(srcMessage.isDm || srcMessage.isText)) return;
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
      console.log(time);
    }).catch(e => {
      console.log(e);
      loggerError(srcMessage, e);
    });
  } else {
    arch.setConfig(srcMessage).then(() => {
      return arch.attachmentRouter(srcMessage);
    }).then(logArray => {
      loggerArray(logArray);
      const time = new Date() - start;
      console.log(time);
    }).catch(e => {
      console.log(e);
      loggerError(srcMessage, e);
    });
  }
});

client.on('ready', () => {
  console.log(`[ info ] Logged in as ${client.user.tag}!`);
	initCmdAll(client);
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
  messageReaction.reactionCurrentUser = Array.from(messageReaction.users.cache.values());
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
    //const time = new Date() - start;
    //console.log(time);
  });
});

client.on("messageDelete", (message) => {
  cacheDb('cacheMsg')
  .where('sourceChannelId', message.channel.id)
  .andWhere('replyId', message.id).del().then(()=>{});
});
