const config = require(require("./shareData.js").configPath);
const sd = require("./shareData.js");
const dbop = require("./dbOperation.js");
const fn = require("./fn.js");
const q = require("./query.js");
const dbCache = require('memory-cache');
const fetch = require("node-fetch");
const formData = require("form-data");

async function postImageInfo(messageObject ,props) {
  var queryResult;
  switch (props.website) {
    case 'pixiv':
      queryResult = await q.pixivQuery(props.uid, 1);
      break;
    default:
      queryResult = null;
  }
  if (queryResult == null) throw new Error('[ warn ] meta-data not found!');
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
  replyContent['components'] = [fn.makePageRow(queryResult)];
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

function helpEmbedAdmin(descriptionAry, moduleName, color, thumbnail) {
  var helpMsg = {
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

function helpMessage(interaction ,props) {
  var adminContent = { embeds: [ sd.helpEmbed ] };
  if (interaction.channel.permissionsFor(interaction.user).has(8192n)) {
    adminContent.embeds.push(
    helpEmbedAdmin(
      props.description,
      sd.functionName,
      props.color,
      props.thumbnail
    ).embeds[0]);
  };
  interaction.reply({
    ...adminContent,
    ephemeral: true
  });

  var logInfo = {
    type: props.opCode,
    sourceId: interaction.id,
    sourceUserId: interaction.user.id,
    sourceTimestamp: interaction.createdTimestamp,
    sourceContent: interaction.commandName,
    sourceChannelId: interaction.channel.id,
    sourceGuildId: interaction.guild.id,
    replyContent: adminContent
  };
  return [logInfo];
}

function dmHelpMessage(messageObject ,props) {
  var adminContent = "";
  if (messageObject.channel.permissionsFor(messageObject.author).has(8192n)) {
    adminContent =
    helpEmbedAdmin(
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

function setReaction(interaction, props) {
  //dbLog['type'] = 'Config';
  //Process setting while checking passed.
  props.reaction = interaction.options.get('reaction').value;
  if (props.reaction == interaction.configReaction) {
    interaction.reply({
      content: 'No modification made',
      ephemeral: true
    });
    throw new Error('[ info ] No modification made');
  }
  let writeData = { "reaction" : props.reaction };
  interaction.reply({
    content: props.reaction,
    ephemeral: true
  });
  dbop.toConfigDB(interaction, writeData);
  var logInfo = {
    type: props.opCode,
    sourceId: interaction.id,
    sourceUserId: interaction.user.id,
    sourceTimestamp: interaction.createdTimestamp,
    sourceContent: interaction.commandName,
    sourceChannelId: interaction.channel.id,
    sourceGuildId: interaction.guild.id
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

function functionStatus(interaction ,props) {
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
  interaction.guild.name + ' and ' + interaction.channel.name;
  var [guildSwitch , channelSwitch] = [interaction.guildSwitch , interaction.channelSwitch];
  for(var i=0;i<sd.functionName.length;i++) {
    moduleStatus +=
    ((guildSwitch & 1) == 1 ? '✅' : '❎') + " " +
    ((channelSwitch & 1) == 1 ? '✅' : '❎') + " " +
    sd.functionName[i] + "\n";
    guildSwitch = guildSwitch >> 1 ;
    channelSwitch = channelSwitch >> 1 ;
  }
  statusEmbed.description = moduleStatus;
  interaction.reply({
    embeds: [statusEmbed],
    ephemeral: true
  });
  //====================== Change text command to slash command, reply ephemeral: true
  //messageObject.delete();

  var logInfo = {
    type: props.opCode,
    sourceId: interaction.id,
    sourceUserId: interaction.user.id,
    sourceTimestamp: interaction.createdTimestamp,
    sourceContent: interaction.commandName,
    sourceChannelId: interaction.channel.id,
    sourceGuildId: interaction.guild.id,
    replyContent: statusEmbed
  };
  return [logInfo];
}

function functionConfig(interaction, props) {
  //dbLog['type'] = 'Config';
  var check = false;
  //var botModule = objectCheck.content.split(" ")[1];
  // Check function name is not illigal.
  props.function = interaction.options.get('name').value;
  for (i=0;i<sd.functionName.length;i++) {
    if (props.function.match(new RegExp(`^${sd.functionName[i]}`,'gm')) != null){
      check = true;
      break;
    }
  }
  if (!check) {
    interaction.reply({
      content: 'Incorrect function name',
      ephemeral: true
    });
    throw new Error('[ info ] Incorrect function name');
  }
  props.isGlobal = interaction.options.get('globally').value;
  props.operation = interaction.options.get('enable').value;
  let functionSwitch = (props.isGlobal) ? interaction.guildSwitch : interaction.channelSwitch;
  if (props.operation ==
    ((
      (functionSwitch >> sd.opProps[props.function]['bit'] & 1)
    ) == 1)) {
      interaction.reply({
        content: 'No modification made',
        ephemeral: true
      });
      throw new Error('[ info ] No modification made');
    }
  let writeData = {
      "functionSwitch" :(
        functionSwitch ^ (1 << sd.opProps[props.function]['bit'])
      )
    };
  interaction.reply({
    content: interaction.options.get('name').value + (props.operation ?   ' 🇴 🇳' : ' 🇴 🇫 🇫'),
    ephemeral: true
  });
  dbop.toConfigDB(interaction, writeData, props.isGlobal);

  var logInfo = {
    type: props.opCode,
    sourceId: interaction.id,
    sourceUserId: interaction.author.id,
    sourceTimestamp: interaction.createdTimestamp,
    sourceContent: interaction.content,
    sourceChannelId: interaction.channel.id,
    sourceGuildId: interaction.guild.id,
  };
  logInfo.operation =
    props.function +
    (props.operation ? ' enable' : ' disable') +
    (props.isGlobal ? ' global' : '');
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
    throw new Error('[ info ] Incorrect module name');
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
      throw new Error('[ info ] No modification made');
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

module.exports = {
  postImageInfo,
  helpMessage,
  dmHelpMessage,
  setReaction,
  dmModuleStatus,
  functionStatus,
  moduleSwitch,
  functionConfig,
  turnPage,
  removeEmbedMsg,
  urlSearch
};
