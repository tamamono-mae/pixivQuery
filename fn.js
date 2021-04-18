/*
function replyMessage(messageObject, content) {
  return new Promise((resolve, reject) => {
    resolve(messageObject.channel.send(content));
  })
}
*/
function addReaction(messageObject, isMultiPage = false) {
  return messageObject.fetch().then(replyMessage => {
    if (isMultiPage) replyMessage.react('⏪');
    return replyMessage;
  }).then(replyMessage => {
    replyMessage.react(messageObject.configReaction);
    return replyMessage;
  }).then(replyMessage => {
    if (isMultiPage) replyMessage.react('⏩');
    return replyMessage;
  }).then(replyMessage => {
    replyMessage.react('🗑️');
    return replyMessage;
  })
}

function replyConfigMessage(messageObject, content, delay = 10) {
  messageObject.channel.send(content)
  .then(replyMessage => {
    setTimeout((() => {
      replyMessage.delete();
    }), delay);
  })
  if (messageObject.isMessageManager)
    setTimeout((() => {
      messageObject.delete();
    }), delay);
}

function pageOffset(isForward){
  return isForward ? 1 : -1;
}

function urlDump(content) {
  const patt = {
    "pixiv" : /^.*\.pixiv\..*\/(\d+)/i,
    "pixivE": /^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i
  };
  if (content.match(patt['pixiv']))
    return { "uid" :content.match(patt['pixiv'])[1] , "website": 'pixiv'};
  if (content.match(patt['pixivE']))
    return { "uid" :content.match(patt['pixivE'])[1] , "website": 'pixiv'};
  return null;
}

function rmReaction(reactionObject) {
  if (reactionObject.count > 1 && reactionObject.isMessageManager)
    reactionObject.users.remove(reactionObject.reactionCurrentUser);
}

module.exports = {
  replyConfigMessage,
  addReaction,
  pageOffset,
  urlDump,
  rmReaction
};
