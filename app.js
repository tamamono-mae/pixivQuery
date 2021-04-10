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

function getImageInfos(decodedInstruction, srcMessage, dbLog, cacheDb) {
  var passResult = {};
  return q.pixivQuery(decodedInstruction.data.pixivID, 1).then(result => {
    if (result == null) throw new Error('meta-preload-data not found!');
    passResult = result;
    return result;
  }).then(result => {
    if (decodedInstruction.textManageable) srcMessage.suppressEmbeds(true);
    return srcMessage.channel.send(q.query2msg(result,decodedInstruction.data.website));
  }).then(message => {
    if (passResult.pageCount > 1)
      message.react('⏮️');
    dbLog['replyId'] = message.id;
    dbLog['pageCount'] = passResult.pageCount;
    dbLog['currentPage'] = 1;
    return message;
  }).then(message => {
    message.react('⭐');
    return message;
  }).then(message => {
    if (passResult.pageCount > 1)
      message.react('⏭️');
    return message;
  }).then(message => {
    message.react('🗑️');
    return message;
  }).then((message) => {
    return {
      'dbLog' : dbLog,
      'logger' : {
        type:'Query',
        sourceId: dbLog.sourceId,
        sourceUserId: dbLog.sourceUserId,
        sourceTimestamp: dbLog.sourceTimestamp,
        sourceContent: dbLog.sourceContent,
        sourceChannel: dbLog.sourceChannel,
        sourceGuild: dbLog.sourceGuild,
        replyContent: srcMessage.embeds[0]
      }
    }
  })
}

function urlSearch(decodedInstruction, srcMessage, dbLog, cacheDb) {
  return q.saucenaoSearch(decodedInstruction.data.url).then(url => {
    if (url == null) throw new Error('Not found');
    dbLog['sourceContent'] = decodedInstruction.data.url;
    if (url.match(new RegExp(`^https:\/\/www\.pixiv\.net\/.+`,'i')) != null){
      decodedInstruction.data.pixivID = url.match(/^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i)[1];
      decodedInstruction.data.website = 'pixiv';
      return getImageInfos(
        decodedInstruction,
        srcMessage,
        dbLog,
        cacheDb
      ).then(result => {
        result['logger']['type'] = 'URL Search';
        return result;
      });
    }
    else {
      dbLog['currentPage'] = 1;
      dbLog['pageCount'] = 1;
      return srcMessage.channel.send(url)
      .then(message => {
        dbLog['replyId'] = message.id;
        return message;
      }).then(message => {
        message.react('⭐');
        return message;
      }).then(message => {
        message.react('🗑️');
        return message;
      }).then(message => {
        return {
          'dbLog' : dbLog,
          'logger' : {
            type:'URL Search',
            sourceId: dbLog.sourceId,
            sourceUserId: dbLog.sourceUserId,
            sourceTimestamp: dbLog.sourceTimestamp,
            sourceContent: dbLog.sourceContent,
            sourceChannel: dbLog.sourceChannel,
            sourceGuild: dbLog.sourceGuild,
            replyContent: srcMessage.embeds[0]
          }
        }
      })
    }
  });
}

module.exports = {
  getImageInfos,
  urlSearch
};
