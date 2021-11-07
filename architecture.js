const config = require("../token/config2.json");
const a = require("./app.js");
const sd = require("./shareData.js");
const dbop = require("./dbOperation.js");
const dbCache = require('memory-cache');

let switchOrderList = [
  {
    patt: /^.*\.pixiv\.net\/(artworks|en\/artworks)\/(?<uid>\d+)/i,
    action: a.postImageInfo,
    varExt: { opCode: "postImageInfo", website: "pixiv" }
  },
  {
    patt: /^.*\.pixiv\..*member_illust\.php.*illust_id=(?<uid>\d+)/i,
    action: a.postImageInfo,
    varExt: { opCode: "postImageInfo", website: "pixiv" }
  },
  {
    patt: /(?<url>^(https|http):\/\/(.+)(.jpg|.png))/i,
    action: a.urlSearch,
    varExt: { opCode: "urlSearch" }
  }
];

async function setEmbedMsgCache(client) {
  var cacheKey = 'cacheMsg_' + client.message.id + '_' + client.message.channel.id;
  if (!client.isDm) {
    cacheKey += '_' + client.message.channel.guild.id;
  }
  if (dbCache.get(cacheKey) != null) {
    client.cacheData = dbCache.get(cacheKey);
    return;
  }
  client.cacheData = await dbop.fetchCache(client.message);
}

async function setConfig(client) {
  let messageObj = (client.message == null) ?
  client : client.message;
  var [guildSwitch , channelSwitch, reaction] = [null,null,null];
  if (!client.isDm) {
    [guildSwitch , channelSwitch, reaction] =
    await dbop.fetchConfig(messageObj);

  } else {
    [guildSwitch , channelSwitch, reaction] =
    [
      [config.defaultDMPermissionBitfield, false],
      [config.defaultDMPermissionBitfield, false],
      config.defaultReaction
    ];
    client.isMessageManager = false;
  }
  client.guildSwitch = guildSwitch[0];
  client.guildFunctionIsDefault = guildSwitch[1];
  client.channelSwitch = channelSwitch[0];
  client.channelFunctionIsDefault = channelSwitch[1];
  client.configReaction = reaction;
}

function attachmentSwitchOrder(client) {
  let functionSwitch = client.guildSwitch & client.channelSwitch;
  var returnOrder = [];
  let item = {
    action: a.urlSearch,
    varExt: { opCode: "imgSearch" , urls: Array.from(client.attachments.values()) }
  }
  let numOfBit = sd.opProps[item.varExt.opCode]['bit'];
  let isOn = ( (functionSwitch >> numOfBit) & 1 ) == 1;
  if (isOn) returnOrder.push(item);

  return returnOrder;
}

function msgSwitchOrder(client) {
  let functionSwitch = client.guildSwitch & client.channelSwitch;
  var returnOrder = [];
  for(var i=0;i<switchOrderList.length;i++) {
    let item = switchOrderList[i];
    let numOfBit = sd.opProps[item.varExt.opCode]['bit'];
    let isOn = ( (functionSwitch >> numOfBit) & 1 ) == 1;
    if (isOn) returnOrder.push(item);
  }
  return returnOrder;
}

function msgAdminCommandOrder(client) {
  if (permissionCheckUser(client, 'moduleSwitch', authorId = '0'))
    return [
      {
        patt: new RegExp(`^${config.prefix} setReaction (?<reaction>..)`,'i'),
        action: a.setReaction,
        varExt: { opCode: "setReaction" }
      },
      {
        patt: new RegExp(`^${config.prefix} status`,'i'),
        action: a.dmModuleStatus,
        varExt: {
          opCode: "status",
          color: config.colors[0],
          thumbnail: config.thumbnail}
      },
      {
        patt: new RegExp(`^${config.prefix} (?<module>.+) (?<operation>enable|disable)(?<isGlobal> global)*`,'i'),
        action: a.moduleSwitch,
        varExt: { opCode: "moduleSwitch" }
      }
    ];
  return [];
}

function permissionCheckBot(client) {
  var messageObject = {};
  if (client.isMsgObj) messageObject = client;
  else messageObject = client.message;
  return [
    //sendMessage
    messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(412384349248n),
    //manageMessage
    messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(534790925376n)
  ]
}

function permissionCheckUser(client, opCode, authorId = '0') {
  var p;
  if (!client.isDm) {
    if (client.isMsgObj) {
      p = ((client.channel.guild.ownerID == client.author.id ? 0x10:0)
        | (client.channel.permissionsFor(client.author).has(0x2000) ? 0x8:0)
        | (client.author.id == authorId ? 0x4:0)
        | 0x3) & sd.opProps[opCode]['perm'];
    } else {
      p = ((client.message.channel.guild.ownerID == client.reactionCurrentUser.id ? 0x10:0)
        | (client.message.channel.permissionsFor(client.reactionCurrentUser).has(0x2000) ? 0x8:0)
        | (client.users.cache.has(authorId) ? 0x4:0)
        | 0x3) & sd.opProps[opCode]['perm'];
    }
  } else {
    p = (client.isMsgObj ? 0x1 : 0x5) & sd.opProps[opCode]['perm'];
  }

  let r = 0;
  for(i=0;i<4;i++){
    r = ((p >> i) & 1) | r;
  }
  return (r == 1);
}

function msgRouter(messageObj) {
  let message = messageObj.content;
  let route = [
    ...msgSwitchOrder(messageObj),
    ...msgAdminCommandOrder(messageObj),
    {
      patt: new RegExp(`^${config.prefix} help`,'i'),
      action: a.dmHelpMessage,
      varExt: {
        opCode: "help",
        color: config.colors[1],
        thumbnail: config.thumbnail,
        description: config.commandDescription
      }
    }

  ];
  //let matchRoute = route.find((route) => message.match(route.patt));
  for (var i=0;i<route.length;i++) {
    let currRoute = route[i];
    let regexResult = currRoute.patt.exec(message);
    if (!regexResult) continue;

    var props = {};
    if (regexResult.groups != null)
    for (var j=0;j<Object.keys(regexResult.groups).length;j++) {
      props[Object.keys(regexResult.groups)[j]] = Object.values(regexResult.groups)[j];
    }

    for (var j=0;j<Object.keys(route[i]['varExt']).length;j++) {
      props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
    }

    let checkPermissionResult = permissionCheckUser(messageObj, currRoute.varExt.opCode);
    if (!checkPermissionResult) throw new Error("Permission denied");
    checkPermissionResult = permissionCheckBot(messageObj);
    if (!checkPermissionResult[0]) throw new Error("Permission of bot denied, exit!");
    messageObj.isMessageManager = checkPermissionResult[1];
    /*
    if (match.middleware) {
      match.middleware(client);
    }
    */
    return currRoute.action(messageObj, props);
  }
}

function attachmentRouter(messageObj) {
  let attachments = Array.from(messageObj.attachments.values());
  let route = [
    ...attachmentSwitchOrder(messageObj)
  ];
  //let matchRoute = route.find((route) => message.match(route.patt));

  for (var i=0;i<route.length;i++) {
    let currRoute = route[i];
    var props = {};

    for (var j=0;j<Object.keys(route[i]['varExt']).length;j++) {
      props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
    }

    let checkPermissionResult = permissionCheckUser(messageObj, currRoute.varExt.opCode);
    if (!checkPermissionResult) throw new Error("Permission denied");
    checkPermissionResult = permissionCheckBot(messageObj);
    if (!checkPermissionResult[0]) throw new Error("Permission of bot denied, exit!");
    messageObj.isMessageManager = checkPermissionResult[1];
    /*
    if (match.middleware) {
      match.middleware(client);
    }
    */
    return currRoute.action(messageObj, props);
  }
}

function reactionRouter(reactionObject) {
  let reaction = reactionObject.emoji.name;
  let route = [
    {
      patt: "⏩",
      action: a.turnPage,
      varExt: { opCode: "turnPage", isNext: true }
    },
    {
      patt: "⏪",
      action: a.turnPage,
      varExt: { opCode: "turnPage", isNext: false }
    },
    {
      patt: "🗑️",
      action: a.removeEmbedMsg,
      varExt: { opCode: "removeEmbedMsg" }
    }
  ];
  //let matchRoute = route.find((route) => message.match(route.patt));

  for (var i=0;i<route.length;i++) {
    let currRoute = route[i];
    if (reaction != currRoute.patt) continue;

    var props = {};
    for (var j=0;j<Object.keys(route[i]['varExt']).length;j++) {
      props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
    }
    let checkPermissionResult = permissionCheckUser(
      reactionObject, currRoute.varExt.opCode,
      reactionObject.cacheData.sourceUserId
    );
    if (!checkPermissionResult) throw new Error("Permission denied");
    checkPermissionResult = permissionCheckBot(reactionObject);
    if (!checkPermissionResult[0]) throw new Error("Permission of bot denied, exit!");
    reactionObject.isMessageManager = checkPermissionResult[1];
    /*
    middleware() {
    }
    */
    return currRoute.action(reactionObject, props);
  }
}

module.exports = {
  setEmbedMsgCache,
  setConfig,
  msgRouter,
  attachmentRouter,
  reactionRouter
};
