const Discord = require("discord.js");
const config = require("../token/config3.json");
const q = require("./query.js");
const db = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: "../env/pixivQuery.db"
  },
  useNullAsDefault: true
});
const client = new Discord.Client();
let patt = {
  "pixiv" : /^.*\.pixiv\..*\/(\d+)/i,
  "pixivE": /^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i
};

function pageOffset(isForward){
  return isForward ? 1 : -1;
}

function urlDump(msg) {
  if (msg.match(patt['pixiv']) != null)
    return { "data" :msg.match(patt['pixiv'])[1] , "website": 'pixiv'};
  if (msg.match(patt['pixivE']) != null)
    return { "data" :msg.match(patt['pixivE'])[1] , "website": 'pixiv'};
  return null;
}

function pageSwitch(entry, client, messageReaction, isForward) {
  q.pixivQuery(urlDump(entry.sourceContent)['data'], entry.currentPage+pageOffset(isForward)).then(result => {
    client.channels.cache.get(messageReaction.message.channel.id).messages.fetch(messageReaction.message.id).then(message => {
      message.edit(q.query2msg(result,urlDump(entry.sourceContent)['website']));
    });
  });
  db('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).update({
    currentPage: entry.currentPage+pageOffset(isForward)
  }).then(()=>{});
}

client.login(config.BOT_TOKEN);

client.on("message", function(srcMessage) {
  var is_dm = srcMessage.channel.type == 'dm';
  if (srcMessage.author.bot) return;
  //if (!message.content.startsWith(config.prefix) && !is_dm) return;
  //var msgbody = (is_dm) ? message.content : message.content.slice(config.prefix.length);
  if (urlDump(srcMessage.content) != null) {
    var dbLog = {
      time: Date.now(),
      sourceId: srcMessage.id,
      sourceUserId: srcMessage.author.id,
      sourceTimestamp: srcMessage.createdTimestamp,
      sourceContent: srcMessage.content,
      sourceChannel: srcMessage.channel.id,
      sourceGuild: srcMessage.guild.id,
      type: urlDump(srcMessage.content)['website']
    };
    q.pixivQuery(urlDump(srcMessage.content)['data'], null).then(result => {
      srcMessage.channel.send(q.query2msg(result,urlDump(srcMessage.content)['website'])).then(
        message => {
          message.react('🗑️');
          dbLog['replyId'] = message.id;
          dbLog['pageCount'] = result.pageCount;
          dbLog['currentPage'] = 1;
          //dbLog['replyContent'] = message.content;
          return message
        }
      ).then(message => {
        if (result.pageCount > 1)
          message.react('⏮️');
        return message
      }).then(message => {
        if (result.pageCount > 1)
          message.react('⏭️');
      }).then(()=>{
        db('cacheMsg').insert([dbLog]).then(()=>{});
      });
    })
  }
});

client.on('ready', () => {
  setInterval(( () => {
    db('cacheMsg').where('sourceTimestamp', '<', Date.now()-86400000).del().then(()=>{});
  } ), 600000);
});

client.on("messageReactionAdd", (messageReaction) => {
  db('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).select('sourceUserId', 'sourceContent', 'pageCount', 'currentPage').then(rows => {
    rows.forEach((entry) => {
      if (messageReaction.users.cache.has(entry.sourceUserId) && messageReaction.emoji.name == '🗑️') {
        client.channels.cache.get(messageReaction.message.channel.id).messages.fetch(messageReaction.message.id).then(message => {
          message.delete();
        });
        db('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).del().then(()=>{});
      };
      if (messageReaction.emoji.name == '⏭️' && entry.currentPage < entry.pageCount && entry.pageCount > 1 && messageReaction.count > 1) {
        pageSwitch(entry, client, messageReaction, true);
      }
      if (messageReaction.emoji.name == '⏮️' && entry.currentPage > 1 && entry.pageCount > 1 && messageReaction.count > 1) {
        pageSwitch(entry, client, messageReaction, false);
      }
    });
  });
});

client.on("messageReactionRemove", (messageReaction) => {
  db('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).select('sourceUserId', 'sourceContent', 'pageCount', 'currentPage').then(rows => {
    rows.forEach((entry) => {
      if (messageReaction.emoji.name == '⏭️' && entry.currentPage < entry.pageCount && entry.pageCount > 1) {
        pageSwitch(entry, client, messageReaction, true);
      }
      if (messageReaction.emoji.name == '⏮️' && entry.currentPage > 1 && entry.pageCount > 1) {
        pageSwitch(entry, client, messageReaction, false);
      }
    });
  });
});

client.on("messageDelete", (message) => {
  db('cacheMsg').where('sourceChannel', message.channel.id).andWhere('replyId', message.id).del().then(()=>{});
});
