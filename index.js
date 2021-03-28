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

function urlDump(msg) {
  if (msg.match(patt['pixiv']) != null)
    return { "data" :msg.match(patt['pixiv'])[1] , "website": 'pixiv'};
  if (msg.match(patt['pixivE']) != null)
    return { "data" :msg.match(patt['pixivE'])[1] , "website": 'pixiv'};
  return null;
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
      sourceGuild: srcMessage.guild.id
    };
    q.pixivQuery(urlDump(srcMessage.content)['data']).then(result => {
      srcMessage.channel.send(q.query2msg(result,urlDump(srcMessage.content)['website'])).then(
        message => {
          message.react('🗑️');
          dbLog['replyId'] = message.id;
          //dbLog['replyContent'] = message.content;
        }
      ).then(()=>{
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
  db('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).select('sourceUserId').then(rows => {
    rows.forEach((entry) => {
      if (messageReaction.users.cache.has(entry.sourceUserId)) {
        client.channels.cache.get(messageReaction.message.channel.id).messages.fetch(messageReaction.message.id).then(message => {
          message.delete();
        });
        db('cacheMsg').where('sourceChannel', messageReaction.message.channel.id).andWhere('replyId', messageReaction.message.id).del().then(()=>{});
      };
    });
  });
});

client.on("messageDelete", (message) => {
  db('cacheMsg').where('sourceChannel', message.channel.id).andWhere('replyId', message.id).del().then(()=>{});
});
