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
const config = require("../token/config3.json");
const sd = require("./shareData.js");
const dbop = require("./dbOperation.js");
const fn = require("./fn.js");
const q = require("./query.js");
const dbCache = require('memory-cache');

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
  if (messageObject.isMessageManager) messageObject.suppressEmbeds(true);
  //post and get replyMessage first
  let replyMessage = await messageObject.channel.send(q.query2msg(queryResult, props.website));
  //add reaction in background
  replyMessage.configReaction = messageObject.configReaction;
  fn.addReaction(replyMessage, (queryResult.pageCount > 1));
  dbWriteData = {
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
  if (props.urlContent != null)
    dbWriteData.sourceContent = props.urlContent;
  var cacheKey = 'cacheMsg_' + dbWriteData.replyId + '_' + dbWriteData.sourceChannelId;
  if (messageObject.guild != null) {
    dbWriteData['sourceGuildId'] = messageObject.guild.id;
    cacheKey += '_' + messageObject.guild.id;
  }
  dbop.toCacheDB(dbWriteData);
  dbCache.put(cacheKey, dbWriteData, config.cacheTimeout);
  /*
  var logInfo = {
      type: props.opCode,
      sourceId: dbWriteData.sourceId,
      sourceUserId: dbWriteData.sourceUserId,
      sourceTimestamp: dbWriteData.sourceTimestamp,
      sourceContent: dbWriteData.sourceContent,
      sourceChannelId: dbWriteData.sourceChannelId,
      replyId: dbWriteData.replyId,

      replyContent: replyMessage.embeds[0]
  }
  if (!messageObject.isDm)
    logInfo.sourceGuildId = dbWriteData.sourceGuilId;
  return logInfo;
  */
}

function helpMessageAdmin(descriptionAry, moduleName, color, thumbnail) {
  var helpMsg = {
    "embed": {
    "title": "Manager commands",
    "description": "",
    "color": 0,
    "thumbnail": {
      "url": ""
    }
  }};
  var modules = "";
  moduleName.forEach(item => {
    modules += "> `" + item + "`\n";
  });
  helpMsg.embed.description =
  descriptionAry[0] + modules + descriptionAry[1];
  helpMsg.embed.color = color;
  helpMsg.embed.thumbnail.url = thumbnail;
  return helpMsg;
}

function dmHelpMessage(message ,props) {
  var adminContent = "";
  if (message.channel.permissionsFor(message.author).has(0x2000)) {
    adminContent =
    helpMessageAdmin(
      props.description,
      sd.moduleName,
      props.color,
      props.thumbnail
    );
    message.author.send(adminContent);
  }
  //srcMessage.channel.send(messageContent);
  if (message.isMessageManager) message.delete();
  /*
  return {
    type:'Help',
    sourceId: dbLog.sourceId,
    sourceUserId: dbLog.sourceUserId,
    sourceTimestamp: dbLog.sourceTimestamp,
    sourceContent: dbLog.sourceContent,
    sourceChannelId: dbLog.sourceChannelId,
    sourceGuildId: dbLog.sourceGuildId,
    replyContent: adminContent
  };
  */
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
  /*
  p.writeBack(
    decodedInstruction.opCode,
    configDb,
    dbWrite.table,
    dbWrite.data,
    srcMessage
  );
  */
  /*
  return {
    type:'Config',
    sourceId: dbLog.sourceId,
    sourceUserId: dbLog.sourceUserId,
    sourceTimestamp: dbLog.sourceTimestamp,
    sourceContent: dbLog.sourceContent,
    sourceChannelId: dbLog.sourceChannelId,
    sourceGuildId: dbLog.sourceGuildId,
    replyContent: ""
  }
  */
}

function dmModuleStatus(messageObject ,props) {
  var statusMsg = {
    "embed": {
    "title": "Status for modules in ",
    "description": "",
    "color": props.color,
    "thumbnail": {
      "url": props.thumbnail
    }
  }};
  var moduleStatus = "🇬 🇨\n";
  statusMsg.embed.title +=
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
  statusMsg.embed.description = moduleStatus;
  messageObject.author.send(statusMsg);
  messageObject.delete();
  /*
  return {
    type:'Status',
    sourceId: dbLog.sourceId,
    sourceUserId: dbLog.sourceUserId,
    sourceTimestamp: dbLog.sourceTimestamp,
    sourceContent: dbLog.sourceContent,
    sourceChannelId: dbLog.sourceChannelId,
    sourceGuildId: dbLog.sourceGuildId,
    replyContent: statusMsg
  };
  */
}

function moduleSwitch(messageObj, props) {
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
      messageObj,
      'Incorrect module name',
      config.deleteMessageDelay
    );
    throw new Error('Incorrect module name');
  }
  props.isGlobal = (props.isGlobal != null);
  props.operation = (props.operation.match(/enable/i) != null);
  let functionSwitch = (props.isGlobal) ? messageObj.guildSwitch : messageObj.channelSwitch;
  if (props.operation ==
    ((
      (functionSwitch >> sd.opProps[props.module]['bit'] & 1)
    ) == 1)) {
      fn.replyConfigMessage(
        messageObj,
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
    messageObj,
    props.module +
    (props.operation ?
    ' 🇴 🇳' : ' 🇴 🇫 🇫'),
    config.deleteMessageDelay
  );
  dbop.toConfigDB(messageObj, writeData, props.isGlobal);
    /*
    return {
      type:'Config',
      sourceId: dbLog.sourceId,
      sourceUserId: dbLog.sourceUserId,
      sourceTimestamp: dbLog.sourceTimestamp,
      sourceContent: dbLog.sourceContent,
      sourceChannelId: dbLog.sourceChannelId,
      sourceGuildId: dbLog.sourceGuildId,
      replyContent: ""
    }
    */
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
  /*
  logInfo = {
    type: decodedInstruction.data.isNext ? 'Next page' : 'Previous page',
    sourceId: messageReaction.message.id,
    sourceUserId: messageReaction.users.cache.array().pop().id,
    sourceTimestamp: Date.now(),
    sourceChannelId: messageReaction.message.channel.id
  };
  if (isText)
    logInfo['sourceGuildId'] = messageReaction.message.channel.guild.id;
  */
}

async function removeEmbedMsg(reactionObject, props) {
  let srcMessage =
  reactionObject.client.channels.cache.get(reactionObject.cacheData.sourceChannelId)
  .messages.cache.get(reactionObject.cacheData.sourceId);
  const cacheData = reactionObject.cacheData;
  const isDm = reactionObject.isDm;
  if (srcMessage != null && reactionObject.isMessageManager)
    srcMessage.suppressEmbeds(false);
  reactionObject.message.delete();
  dbop.deleteCacheDBData(cacheData);
  var cacheKey = 'cacheMsg_' + cacheData.replyId + '_' + cacheData.sourceChannelId;
  if (!isDm) {
    cacheKey += '_' + cacheData.sourceGuildId;
  }
  dbCache.del(cacheKey);
  /*
  logInfo = {
    type:'Delete',
    sourceId: message.id,
    sourceUserId: sourceUserId,
    sourceTimestamp: Date.now(),
    sourceContent: message.embeds[0],
    sourceChannelId: message.channel.id
  };
  if (isText)
    logInfo['sourceGuildId'] = message.channel.guild.id;
  */
}

async function postUrl(messageObject ,props) {
  if (messageObject.isMessageManager) messageObject.suppressEmbeds(true);
  //post and get replyMessage first
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
  var cacheKey = 'cacheMsg_' + dbWriteData.replyId + '_' + dbWriteData.sourceChannelId;
  if (messageObject.guild != null) {
    dbWriteData['sourceGuildId'] = messageObject.guild.id;
    cacheKey += '_' + messageObject.guild.id;
  }
  dbop.toCacheDB(dbWriteData);
  dbCache.put(cacheKey, dbWriteData, config.cacheTimeout);
  /*
  return {
    'dbLog' : dbLog,
    'logger' : {
      type:'Query',
      sourceId: dbLog.sourceId,
      sourceUserId: dbLog.sourceUserId,
      sourceTimestamp: dbLog.sourceTimestamp,
      sourceContent: dbLog.sourceContent,
      sourceChannelId: dbLog.sourceChannelId,
      sourceGuildId: dbLog.sourceGuildId,
      replyContent: srcMessage.embeds[0]
    }
  */
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
    console.log(searchResult);
    var promisePool = [];
    for (var i=0;i<searchResult.length;i++) {
      var props = {};
      props.urlContent = searchResult[i];
      if (fn.urlDump(searchResult[i]) != null) {
        //修改router list varExt參數與urlDump使中繼資料Tag相同
        props.uid = fn.urlDump(searchResult[i]).uid;
        props.website = fn.urlDump(searchResult[i]).website;
        promisePool.push(postImageInfo(messageObject, props));
      }
      else {
        props.urlContent = searchResult[i];
        promisePool.push(postUrl(messageObject, props));
      }
    }
    return Promise.all(promisePool);
  });
}

module.exports = {
  postImageInfo,
  dmHelpMessage,
  setReaction,
  dmModuleStatus,
  moduleSwitch,
  turnPage,
  removeEmbedMsg,
  urlSearch
};
