const Discord = require("discord.js");
const config = require("../token/config2.json");
const q = require("./query.js");
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

client.on("message", function(message) {
  var is_dm = message.channel.type == 'dm';
  if (message.author.bot) return;
  //if (!message.content.startsWith(config.prefix) && !is_dm) return;
  //var msgbody = (is_dm) ? message.content : message.content.slice(config.prefix.length);
  if (urlDump(message.content) != null)
    q.pixivQuery(urlDump(message.content)['data']).then(result => {
      message.channel.send(q.query2msg(result,urlDump(message.content)['website']))
    });

});
