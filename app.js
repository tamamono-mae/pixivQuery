/*
saucenaoSearch
pixivQuery
generateEmbed

help
urlSearch
setReaction
status
moduleSwitch

turnPage
deleteEmbed
*/
const config = require("../token/config2.json");
const sd = require("./shareData.js");
const dbop = require("./dbOperation.js");
const fn = require("./fn.js");
const q = require("./query.js");
const dbCache = require('memory-cache');
const fetch = require("node-fetch");
const formData = require("form-data");
const { Routes } = require('discord-api-types/v9');
const { REST } = require('@discordjs/rest');

async function postImageInfo(messageObject ,props) {
  var queryResult;
  switch (props.website) {
    case 'pixiv':
      queryResult = await q.pixivQuery(props.uid, 1);
      break;
    default:
      queryResult = null;
  }
  if (queryResult == null) throw new Error('meta-data not found!');
  if (messageObject.isMessageManager && !messageObject.deleted) {
    messageObject = await messageObject.delete();
  }
  //if (messageObject.isMessageManager) messageObject.suppressEmbeds(true);
  //Discord disable this function for bot.           ^^^^^^^^^^^^^^^
  //post and get replyMessage first
  let replyContent = q.query2msg(queryResult, props.website);
  /* Remove Cache
  const imgCacheKey = 'cache.'+encodeURIComponent(replyContent.embed.image.url);
  if (!dbCache.get(imgCacheKey)) {
    console.log('Caching ' + replyContent.embed.image.url);
    //let body = await fetch(replyContent.embed.image.url);
    //console.log(messageObject.client);
    //const cacheChannel = messageObject.client.channels.cache;
    //console.log(cacheChannel);
    //let cachedImg = await messageObject.client.channels.cache.get(config.workingSpaceChannelId).send(replyContent.embed.image.url);

    var cacheImgHeaders = {
      'Authorization': 'Bearer ' + config.imgurBearer
    };

    var cacheImgformdata = new formData();
    cacheImgformdata.append("image", replyContent.embed.image.url);
    cacheImgformdata.append("album", config.imgurAlbum);
    cacheImgformdata.append("type", "url");

    var requestOptions = {
      method: 'POST',
      headers: cacheImgHeaders,
      body: cacheImgformdata,
      redirect: 'follow'
    };

    const resJson = await fetch("https://api.imgur.com/3/upload", requestOptions)
      .then(response => response.json())
      .catch(error => console.log('error', error));

    console.log('Cached');
    dbCache.put(imgCacheKey, resJson.data.link);
  }
  replyContent.embed.image.url = dbCache.get(imgCacheKey);
  */
  replyContent["content"] =
  "This message was posted by\n" +
  messageObject.author.username + " (" + messageObject.author.id + ").";
  let replyMessage = await messageObject.channel.send(replyContent);
  //add reaction in background
  replyMessage.configReaction = messageObject.configReaction;
  fn.addReaction(replyMessage, (queryResult.pageCount > 1));
  var dbWriteData = {
    time: Date.now(),
    sourceId: messageObject.id,
    sourceUserId: messageObject.author.id,
    sourceTimestamp: messageObject.createdTimestamp,
    sourceContent: messageObject.content,
    sourceChannelId: messageObject.channel.id,
    replyId: replyMessage.id,
    pageCount: queryResult.pageCount,
    currentPage: 1,
    type: props.website
  }
  var logInfo = {
      type: props.opCode,
      sourceId: dbWriteData.sourceId,
      sourceUserId: dbWriteData.sourceUserId,
      sourceTimestamp: dbWriteData.sourceTimestamp,
      sourceContent: dbWriteData.sourceContent,
      sourceChannelId: dbWriteData.sourceChannelId,
      replyId: dbWriteData.replyId,
      replyContent: replyContent
  }
  if (props.urlContent != null) {
    dbWriteData.sourceContent = props.urlContent;
    logInfo.sourceContent = props.urlContent;
  }
  var cacheKey = 'cacheMsg_' + dbWriteData.replyId + '_' + dbWriteData.sourceChannelId;
  if (!messageObject.isDm) {
    dbWriteData['sourceGuildId'] = messageObject.guild.id;
    cacheKey += '_' + messageObject.guild.id;
    logInfo.sourceGuildId = messageObject.guild.id;
  }
  dbop.toCacheDB(dbWriteData);
  dbCache.put(cacheKey, dbWriteData, config.cacheTimeout);
  switch (props.opCode) {
    case 'imgSearch':
    case 'urlSearch':
      return logInfo;
    default:
      return [logInfo];
  }
}

function helpMessageAdmin(descriptionAry, moduleName, color, thumbnail) {
  helpMsg = {
    "title": "Manager commands",
    "description": "",
    "color": 0,
    "thumbnail": {
      "url": ""
    }
  };
  var modules = "";
  moduleName.forEach(item => {
    modules += "> `" + item + "`\n";
  });
  helpMsg.description =
  descriptionAry[0] + modules + descriptionAry[1];
  helpMsg.color = color;
  helpMsg.thumbnail.url = thumbnail;
  return { embeds: [helpMsg] };
}

function dmHelpMessage(messageObject ,props) {
  var adminContent = "";
  if (messageObject.channel.permissionsFor(messageObject.author).has(8192n)) {
    adminContent =
    helpMessageAdmin(
      props.description,
      sd.moduleName,
      props.color,
      props.thumbnail
    );
    messageObject.author.send(adminContent);
  }
  //srcMessage.channel.send(messageContent);
  if (messageObject.isMessageManager) messageObject.delete();

  var logInfo = {
    type: props.opCode,
    sourceId: messageObject.id,
    sourceUserId: messageObject.author.id,
    sourceTimestamp: messageObject.createdTimestamp,
    sourceContent: messageObject.content,
    sourceChannelId: messageObject.channel.id,
    sourceGuildId: messageObject.guild.id,
    replyContent: adminContent
  };
  return [logInfo];
}

function setReaction(messageObject ,props) {
  //dbLog['type'] = 'Config';
  if (props.reaction == messageObject.configReaction) {
    fn.replyConfigMessage(
      messageObject,
      'No modification made',
      config.deleteMessageDelay
    );
    throw new Error('No modification made');
  }
  let writeData = { "reaction" : props.reaction };
  fn.replyConfigMessage(
    messageObject,
    props.reaction,
    config.deleteMessageDelay
  );
  dbop.toConfigDB(messageObject, writeData);
  var logInfo = {
    type: props.opCode,
    sourceId: messageObject.id,
    sourceUserId: messageObject.author.id,
    sourceTimestamp: messageObject.createdTimestamp,
    sourceContent: messageObject.content,
    sourceChannelId: messageObject.channel.id,
    sourceGuildId: messageObject.guild.id
  };
  logInfo.operation = 'set ' + props.reaction;
  return [logInfo];
}

function dmModuleStatus(messageObject ,props) {
  /*
  var statusMsg = {
    "embed": {
    "title": "Status for modules in ",
    "description": "",
    "color": props.color,
    "thumbnail": {
      "url": props.thumbnail
    }
  }};
  */
  var statusEmbed = {
    "title": "Status for modules in ",
    "description": "",
    "color": props.color,
    "thumbnail": {
        "url": props.thumbnail
      }
  };
  var moduleStatus = "🇬 🇨\n";
  statusEmbed.title +=
  messageObject.guild.name + ' and ' + messageObject.channel.name;
  var [guildSwitch , channelSwitch] = [messageObject.guildSwitch , messageObject.channelSwitch];
  for(var i=0;i<sd.moduleName.length;i++) {
    moduleStatus +=
    ((guildSwitch & 1) == 1 ? '✅' : '❎') + " " +
    ((channelSwitch & 1) == 1 ? '✅' : '❎') + " " +
    sd.moduleName[i] + "\n";
    guildSwitch = guildSwitch >> 1 ;
    channelSwitch = channelSwitch >> 1 ;
  }
  statusEmbed.description = moduleStatus;
  messageObject.author.send({ embeds: [statusEmbed] });
  //====================== Change text command to slash command, reply ephemeral: true
  //messageObject.delete();

  var logInfo = {
    type: props.opCode,
    sourceId: messageObject.id,
    sourceUserId: messageObject.author.id,
    sourceTimestamp: messageObject.createdTimestamp,
    sourceContent: messageObject.content,
    sourceChannelId: messageObject.channel.id,
    sourceGuildId: messageObject.guild.id,
    replyContent: statusEmbed
  };
  return [logInfo];
}

function moduleSwitch(messageObject, props) {
  //dbLog['type'] = 'Config';
  var check = false;
  //var botModule = objectCheck.content.split(" ")[1];
  for (i=0;i<sd.moduleName.length;i++) {
    if (props.module.match(new RegExp(`^${sd.moduleName[i]}`,'gm')) != null){
      check = true;
      break;
    }
  }
  if (!check) {
    fn.replyConfigMessage(
      messageObject,
      'Incorrect module name',
      config.deleteMessageDelay
    );
    throw new Error('Incorrect module name');
  }
  props.isGlobal = (props.isGlobal != null);
  props.operation = (props.operation.match(/enable/i) != null);
  let functionSwitch = (props.isGlobal) ? messageObject.guildSwitch : messageObject.channelSwitch;
  if (props.operation ==
    ((
      (functionSwitch >> sd.opProps[props.module]['bit'] & 1)
    ) == 1)) {
      fn.replyConfigMessage(
        messageObject,
        'No modification made',
        config.deleteMessageDelay
      );
      throw new Error('No modification made');
    }
  let writeData = {
      "functionSwitch" :(
        functionSwitch ^ (1 << sd.opProps[props.module]['bit'])
      )
    };
  fn.replyConfigMessage(
    messageObject,
    props.module +
    (props.operation ?
    ' 🇴 🇳' : ' 🇴 🇫 🇫'),
    config.deleteMessageDelay
  );
  dbop.toConfigDB(messageObject, writeData, props.isGlobal);

  var logInfo = {
    type: props.opCode,
    sourceId: messageObject.id,
    sourceUserId: messageObject.author.id,
    sourceTimestamp: messageObject.createdTimestamp,
    sourceContent: messageObject.content,
    sourceChannelId: messageObject.channel.id,
    sourceGuildId: messageObject.guild.id,
  };
  logInfo.operation =
    props.module +
    (props.operation ? ' enable' : ' disable') +
    (props.isGlobal ? ' global' : '');
  return [logInfo];
}

async function turnPage(reactionObject, props) {
  fn.rmReaction(reactionObject);
  var check = false;
  if (
    props.isNext &&
    reactionObject.cacheData.currentPage < reactionObject.cacheData.pageCount &&
    reactionObject.cacheData.pageCount > 1
    )
      check = true;
  if (
    !props.isNext &&
    reactionObject.cacheData.currentPage > 1 &&
    reactionObject.cacheData.pageCount > 1
    )
      check = true;
  if (!check) return;
  var queryResult;
  var dumpResult;
  reactionObject.cacheData.currentPage += fn.pageOffset(props.isNext);
  switch (reactionObject.cacheData.type) {
    case 'pixiv':
      dumpResult = fn.urlDump(reactionObject.cacheData.sourceContent);
      queryResult = await q.pixivQuery(dumpResult['uid'], reactionObject.cacheData.currentPage);
      break;
  }
  reactionObject.message.edit(q.query2msg(queryResult,dumpResult['website']));
  dbop.updateCurrentPage(reactionObject);
  //Update cache data
  var cacheKey = 'cacheMsg_' + reactionObject.message.id + '_' + reactionObject.message.channel.id;
  if (!reactionObject.isDm) {
    cacheKey += '_' + reactionObject.message.channel.guild.id;
  }
  dbCache.del(cacheKey);
  dbCache.put(cacheKey ,reactionObject.cacheData);

  var logInfo = {
    type: props.opCode,
    sourceId: reactionObject.message.id,
    sourceUserId: reactionObject.reactionCurrentUser,
    sourceTimestamp: reactionObject.rts,
    sourceContent: reactionObject.emoji.name,
    sourceChannelId: reactionObject.message.channel.id,
  };
  if (!reactionObject.isDm)
    logInfo.sourceGuildId = reactionObject.message.guild.id;
  return [logInfo];
}

async function removeEmbedMsg(reactionObject, props) {
  let srcMessage =
  reactionObject.client.channels.cache.get(reactionObject.cacheData.sourceChannelId)
  .messages.cache.get(reactionObject.cacheData.sourceId);
  const cacheData = reactionObject.cacheData;
  const isDm = reactionObject.isDm;
  /*
  if (srcMessage != null && reactionObject.isMessageManager)
    srcMessage.suppressEmbeds(false);
  */
  dbop.deleteCacheDBData(cacheData);
  var cacheKey = 'cacheMsg_' + cacheData.replyId + '_' + cacheData.sourceChannelId;
  if (!isDm) {
    cacheKey += '_' + cacheData.sourceGuildId;
  }
  dbCache.del(cacheKey);

  let rreactionObject = {
    reactionCurrentUser: reactionObject.reactionCurrentUser,
    isDm: reactionObject.isDm,
    rts: reactionObject.rts
  }
  let replyMessage = await reactionObject.message.delete();

  var logInfo = {
    type: props.opCode,
    sourceId: replyMessage.id,
    sourceUserId: rreactionObject.reactionCurrentUser,
    sourceTimestamp: rreactionObject.rts,
    sourceContent: replyMessage.embeds[0],
    sourceChannelId: replyMessage.channel.id,
  };
  if (!rreactionObject.isDm)
    logInfo.sourceGuildId = replyMessage.guild.id;
  return [logInfo];
}

async function postUrl(messageObject ,props) {
  //if (messageObject.isMessageManager) messageObject.suppressEmbeds(true);
  //post and get replyMessage first
  props.urlContent =
  "This message was posted by\n" +
  messageObject.author.username +
  " (" + messageObject.author.id + ").\n" +
  props.urlContent;
  let replyMessage = await messageObject.channel.send(props.urlContent);
  //add reaction in background
  replyMessage.configReaction = messageObject.configReaction;
  fn.addReaction(replyMessage, false);
  dbWriteData = {
    time: Date.now(),
    sourceId: messageObject.id,
    sourceUserId: messageObject.author.id,
    sourceTimestamp: messageObject.createdTimestamp,
    sourceContent: messageObject.content,
    sourceChannelId: messageObject.channel.id,
    sourceContent: props.urlContent,
    replyId: replyMessage.id,
    pageCount: 1,
    currentPage: 1,
    type: 'Other'
  }
  var logInfo = {
    type: props.opCode,
    sourceId: dbWriteData.sourceId,
    sourceUserId: dbWriteData.sourceUserId,
    sourceTimestamp: dbWriteData.sourceTimestamp,
    sourceContent: dbWriteData.sourceContent,
    sourceChannelId: dbWriteData.sourceChannelId,
    replyId: dbWriteData.replyId,
    replyContent: replyMessage.content
  }
  var cacheKey = 'cacheMsg_' + dbWriteData.replyId + '_' + dbWriteData.sourceChannelId;
  if (messageObject.guild != null) {
    dbWriteData['sourceGuildId'] = messageObject.guild.id;
    cacheKey += '_' + messageObject.guild.id;
    logInfo.sourceGuildId = messageObject.guild.id;
  }
  dbop.toCacheDB(dbWriteData);
  dbCache.put(cacheKey, dbWriteData, config.cacheTimeout);
  return logInfo;
}

function urlSearch(messageObject, props) {
  var urlPool = [];
  var promisePool = [];
  let pattern = new RegExp(`(?<url>^(https|http):\/\/(.+)(.jpg|.png))`,'i');
  if (props.opCode == 'imgSearch') {
    for (var i=0;i<props.urls.length;i++) {
      if (props['urls'][i]['attachment'].match(pattern) != null)
        urlPool.push(props['urls'][i]['attachment']);
    }
  }
  if (props.opCode == 'urlSearch') {
    let tempPool = messageObject.content.split("\n");
    for (var i=0;i<tempPool.length;i++) {
      if (tempPool[i].match(pattern) != null)
        urlPool.push(tempPool[i]);
    }
  }
  for (var i=0;i<urlPool.length;i++)
    promisePool.push(q.saucenaoSearch(urlPool[i]));
  return Promise.all(promisePool).then(searchResult => {
    var promisePool = [];
    //Remove duplicates and null from searchResult
    searchResult = Array.from(new Set(searchResult)).filter(item => item != null);
    if (searchResult.length == 0) throw new Error('No result');
    for (var i=0;i<searchResult.length;i++) {
      var subProps = {
        opCode: props.opCode,
        urlContent: searchResult[i]
      };
      if (fn.urlDump(searchResult[i]) != null) {
        subProps.uid = fn.urlDump(searchResult[i]).uid;
        subProps.website = fn.urlDump(searchResult[i]).website;
        promisePool.push(postImageInfo(messageObject, subProps));
      }
      else {
        promisePool.push(postUrl(messageObject, subProps));
      }
    }
    return Promise.all(promisePool);
  }).then(logArray => {
    /*
    if(messageObject != null && props.opCode == 'imgSearch' && messageObject.isMessageManager)
      messageObject.delete();
    */
    if(messageObject != null && !messageObject.deleted && messageObject.isMessageManager)
      messageObject.delete();
    return logArray;
  });
}

async function initCmd(rest, userID, guildsHandling, commands) {
  try {
    await rest.put(
      Routes.applicationGuildCommands(userID, guildsHandling),
      { body: commands }
    );
  } catch (error) {
    console.error(error);
  }
}

async function initCmdAll(client) {
  const rest = new REST({ version: '9' }).setToken(config.BOT_TOKEN);
  const commands = require("./shareData.js").commands;
  let guildsHandling = Array.from(client.guilds.cache.keys());
  //Initilize commands
  console.log(`[ info ] Initilize commands ...`);
  var promisePool = [];
  //Make a task array for multi-tasking.
  for (var i=0; i<guildsHandling.length; i++) {
    promisePool.push(
      initCmd(rest, client.user.id, guildsHandling[i], commands)
    );
  }
  //Launch tasks.
  await Promise.all(promisePool);
  console.log(`[ info ] Initilize commands finished.`);
}

module.exports = {
  postImageInfo,
  dmHelpMessage,
  setReaction,
  dmModuleStatus,
  moduleSwitch,
  turnPage,
  removeEmbedMsg,
  urlSearch,
  initCmdAll
};
