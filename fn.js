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

function makePageRow(data) {
  let pageRow = {
    type: 'ACTION_ROW',
    components: [
      {
        type: 'BUTTON',
        label: '🗑️',
        customId: 'remove',
        style: 'DANGER',
        emoji: null,
        url: null,
        disabled: false
      }
    ]
  }
  if (data.pageCount <= 1) return pageRow;

  return {
    type: 'ACTION_ROW',
    components: [
      {
        type: 'BUTTON',
        label: '<<',
        customId: 'previousPage',
        style: 'PRIMARY',
        emoji: null,
        url: null,
        disabled: (data.currentPage <= 1)
      },
      {
        type: 'BUTTON',
        label: data.currentPage + '/' + data.pageCount,
        customId: 'page',
        style: 'SECONDARY',
        emoji: null,
        url: null,
        disabled: true
      },
      {
        type: 'BUTTON',
        label: '>>',
        customId: 'nextPage',
        style: 'PRIMARY',
        emoji: null,
        url: null,
        disabled: (data.currentPage >= data.pageCount)
      },
      pageRow.components[0]
    ]
  };
}

function checkParameterUndfeind(interaction, varKey) {
  let parameterUndfeind = [];
  let varKeyCurrent;
  for(let i=0; i<varKey.length; i++){
    varKeyCurrent = interaction.options.get(varKey[i]);
    if(varKeyCurrent == null) parameterUndfeind.push(varKey[i]);
  }
  return parameterUndfeind;
}

function textArray2str(textArray, separator) {
  if (textArray == null) return [];
  let s = '';
  const lastItem = textArray.pop();
  textArray.forEach((item, i) => {
    s += item + separator;
  });
  s += lastItem;
  return s;
}

function preFilter(interaction) {
  if(interaction.user.bot) return 'userIsBot';
  if(interaction.channel == null) return 'dmChannel';
  if (!(
    (interaction.channel.type == 'GUILD_TEXT') ||
    (interaction.channel.type == 'GUILD_PUBLIC_THREAD') ||
    (interaction.channel.type == 'GUILD_PRIVATE_THREAD')
  )) return 'notTextChannel';
  return 'pass';
}

function rejectInteration(interaction, reason) {
  switch(reason) {
    case 'pass':
      return false;
    case 'buttonPermission':
    case 'buttonUnexpected':
      interaction.update({});
    break;
    case 'userIsBot':
      interaction.reply({
        content: 'All bots cannot use this application  !',
        ephemeral: true
      });
    break;
    case 'dmChannel':
      interaction.reply({
        content: 'This application is design for guilds !',
        ephemeral: true
      });
    break;
    case 'notTextChannel':
      interaction.reply({
        content: 'This application can not be use in non-text channel !',
        ephemeral: true
      });
    break;
    case 'userPermission':
      interaction.reply({
        content: 'Permission denied !',
        ephemeral: true
      });
    break;
    case 'botPermission':
      console.warn(
        'Bot permission error in guild: ' +
        interaction.guild.id + ' ' +
        interaction.guild.name
      );
    break;
    case 'roleNotInGuild':
      interaction.reply({
        content: 'This role is not in this guild !',
        ephemeral: true
      });
    break;
    case 'roleNotInDb':
      interaction.reply({
        content: "This role hasn't been add to manager !",
        ephemeral: true
      });
    break;
    case 'invalidParameter':
      interaction.reply({
        content: "Invalid Parameter !",
        ephemeral: true
      });
    break;
    case 'roleExistInDb':
      interaction.reply({
        content: "This role already has been manager !",
        ephemeral: true
      });
    break;
    case 'roleNotExistInDb':
      interaction.reply({
        content: "This role is not found in manager list !",
        ephemeral: true
      });
    break;
    case 'invalidEmoji':
      interaction.reply({
        content: "This is not a valid emoji !",
        ephemeral: true
      });
    break;
    case 'emojiUnusable':
      interaction.reply({
        content: "This emoji should be add to this guild !",
        ephemeral: true
      });
    break;
    case 'noModification':
      interaction.reply({
        content: 'No modification made',
        ephemeral: true
      });
    break;
  }
  return true;
}

function reactionParse(reactionStr) {
  const pattern = [
    /^<:(?<name>.*):(?<id>\d+)>/i,
    /^<a:(?<name>.*):(?<id>\d+)>/i,
    /^a:(?<name>.*):(?<id>\d+)/i,
    /^(?<name>.*):(?<id>\d+)/i,
  ];
  let result = null;
  for(let i=0;i<pattern.length;i++) {
    result = pattern[i].exec(reactionStr);
    if(result != null) break;
  }
  return result;
}

async function cacheImage(data) {
  /*{
    url: replyContent.embeds[0].image.url,
    bearer: config.imgurBearer,
    cacheImgformdata: new formData(),
    album: config.imgurAlbum,
    dbCache: dbCache,
    key: imgCacheKey
  }*/
  const imgCacheKey = 'cache.'+encodeURIComponent(data.url);
  let imgCacheUrl = data.dbCache.get(imgCacheKey);
  //Get from db
  if (!imgCacheUrl) {
    imgCacheUrl = await data.dbop.fetchImageCache(data.url);
    data.dbCache.put(imgCacheKey, imgCacheUrl);
  }
  //Get from search
  if (!imgCacheUrl) {
    console.info('Caching ' + data.url);
    let cacheImgHeaders = {
      'Authorization': 'Bearer ' + data.bearer
    };
    data.cacheImgformdata.append("image", data.url);
    data.cacheImgformdata.append("album", data.album);
    data.cacheImgformdata.append("type", "url");
    data.cacheImgformdata.append("name", data.info.illustId + '.jpg');
    data.cacheImgformdata.append("title", data.info.title);
    data.cacheImgformdata.append("description", data.info.image);

    let requestOptions = {
      method: 'POST',
      headers: cacheImgHeaders,
      body: data.cacheImgformdata,
      redirect: 'follow'
    };
    const resJson = await data.fetch("https://api.imgur.com/3/upload", requestOptions)
      .then(response => response.json())
      .catch(error => console.error('error', error));
    console.info('Cached');
    data.dbCache.put(imgCacheKey, resJson.data.link);
    data.dbop.writeImageCache({ source: data.url, url: resJson.data.link });
  }
  return data.dbCache.get(imgCacheKey);
}

module.exports = {
  replyConfigMessage,
  pageOffset,
  urlDump,
  checkParameterUndfeind,
  makePageRow,
  textArray2str,
  preFilter,
  rejectInteration,
  reactionParse,
  cacheImage
};
