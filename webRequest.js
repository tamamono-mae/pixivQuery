const fetch = require("node-fetch");
const cheerio = require("cheerio");
const formData = require("form-data");
const { htmlToText } = require('html-to-text');
const config = require(require("./shareData.js").configPath);
const memoryCache = require('memory-cache');
const { textArray2str } = require('./fn.js');
const { webIcons } = require("./shareData.js");
const { fetchImageCache, writeImageCache } = require('./dbOperation.js');

async function checkUrls(urlArr) {
  for(var i=0;i<urlArr.length;i++) {
    let http_status = await fetch(urlArr[i])
    .then(res => {return res.status;});
    if (http_status == 200) return urlArr[i];
  }
  return null;
}

function mkfd(url) {
  let formdata = new formData();
  formdata.append("Content-Type", "application/octect-stream");
  formdata.append("url", url);
  formdata.append("frame", "1");
  formdata.append("hide", "0");
  formdata.append("database", "999");
  return formdata;
}

function extractTag(tagObjs) {
  var tagNames = [];
  for(var i=0; i<tagObjs.length; i++) tagNames.push(tagObjs[i].tag);
  return tagNames;
}

function saucenaoSearch(url){
  if (memoryCache.get('sauceSearch_'+url) != null) {
    return memoryCache.get('sauceSearch_'+url);
  }
  var formdata = mkfd(url);
  return fetch('https://saucenao.com/search.php',
  {
    method: 'POST',
    headers: formdata.getHeaders(),
    body: formdata,
    redirect: 'follow'
  })
  .then(res => res.text())
  .then(body => {
    let $ = cheerio.load(body);
    //return $(".result .resulttable .resulttablecontent").length;
    var tables = [];
    var results = [];
    if ($(".result .resulttable .resulttablecontent").length == 0) return [];
    for(var i=0;i<$(".result .resulttable .resulttablecontent").length;i++){
      tables.push($(".result .resulttable .resulttablecontent").eq(i));
    };
    if (tables.length == 0) return [];
    for(var i=0;i<tables.length;i++){
      var c = cheerio.load(tables[i].html());
      if (
        (parseInt(c(".resultsimilarityinfo").text()) >= config.similarityThreshold) &&
        c(".resultcontentcolumn").find("a").eq(0).attr("href") != null
      ){
        results.push(c(".resultcontentcolumn").find("a").eq(0).attr("href"));
      }
    }
    return results;
  })
  .then(results => {
    let data = (results.length > 0) ? checkUrls(results) : null;
    memoryCache.put('sauceSearch_'+url, data, config.cacheTimeout);
    return data;
  })
}

function imgCount(pageCount,currentPage) {
  if(currentPage <= pageCount && pageCount > 1)
    return currentPage - 1;
  else return 0;
}

async function pixivQuery(illustId, currentPage){
  //var formdata = mkfd(url);
  if (memoryCache.get('pixiv_'+illustId) != null) {
    return memoryCache.get('pixiv_'+illustId);
  }
  let body = await fetch('https://www.pixiv.net/artworks/'+illustId)
  .then(res => res.text());
  let $ = cheerio.load(body);
  let meta_preload_data = JSON.parse($("#meta-preload-data").attr("content"));
  let data = ($("#meta-preload-data").length > 0) ? {
    "title": meta_preload_data['illust'][illustId]['illustTitle'],
    "description": htmlToText(meta_preload_data['illust'][illustId]['illustComment'],{
      tags: { 'a': { options: { ignoreHref: true } } },
      wordwrap: false
    }),
    "url": "https://www.pixiv.net/artworks/"+meta_preload_data['illust'][illustId]['illustId'],
    "tags": extractTag(meta_preload_data.illust[illustId].tags.tags),
    "name": meta_preload_data['illust'][illustId]['userName'],
    "userId": meta_preload_data['illust'][illustId]['userId'],
    "illustId": illustId,
    "timestamp": meta_preload_data['illust'][illustId]['createDate'].substr(0, 19)+'.000Z',
    //"image": 'https://pixiv.cat/'+illustId+imgCount(meta_preload_data['illust'][illustId]['pageCount'], currentPage)+'.jpg',
    "image": meta_preload_data['illust'][illustId]['urls']['regular'].replace('pximg.net','pixiv.cat').replace('_p0_master1200.','_p'+imgCount(meta_preload_data['illust'][illustId]['pageCount'], currentPage)+'_master1200.'),
    "thumbnail": meta_preload_data['user'][meta_preload_data['illust'][illustId]['userId']]['imageBig'].replace('pximg.net','pixiv.cat'),
    "pageCount": meta_preload_data['illust'][illustId]['pageCount'],
    "xRestrict": meta_preload_data['illust'][illustId]['xRestrict'],
    "currentPage": currentPage
  } : null;
  memoryCache.put('webCache_pixiv_'+data.illustId, data, config.cacheTimeout);
  console.log(data.image);
  return data;
}

function query2msg(data,type){
  switch (type) {
    case 'pixiv':
    return {
      "embeds":
        [{
          "title": data['title'],
          "description": data['description'],
          "url": data['url'],
          "color": data['xRestrict'] == 0 ? config.colors[0] : config.colors[1],
          "fields": [
            {
              "name": "Author",
              "value": "["+data['name']+"](https://www.pixiv.net/users/"+data['userId']+")",
              "inline": true
            },
            {
              "name": "Illust ID",
              "value": "["+data['illustId']+"]("+data['url']+")",
              "inline": true
            },
            {
              "name": "Tags",
              "value": textArray2str(data.tags, ', '),
              "inline": false
            }
          ],
          "author": {
            "name": data['name'],
            "url": "https://www.pixiv.net/users/"+data['userId'],
            "icon_url": webIcons.pixiv
          },
          "timestamp": data['timestamp'],
          "image": {
            "url": data['image']
          },
          "thumbnail": {
            "url": data['thumbnail']
          }
        }]
    }
    break;
    default:

  }
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
  let cacheImgformdata = new formData();
  const imgCacheKey = 'cache.'+encodeURIComponent(data.url);
  let imgCacheUrl = memoryCache.get(imgCacheKey);
  //Get from db
  if (!imgCacheUrl) {
    imgCacheUrl = await fetchImageCache(data.url);
    memoryCache.put(imgCacheKey, imgCacheUrl);
  }
  //Get from search
  if (!imgCacheUrl) {
    console.info('Caching ' + data.url);
    let cacheImgHeaders = {
      'Authorization': 'Bearer ' + config.imgurBearer
    };
    cacheImgformdata.append("image", data.url);
    cacheImgformdata.append("album",config.imgurAlbum);
    cacheImgformdata.append("type", "url");
    cacheImgformdata.append("name", data.info.illustId + '.jpg');
    cacheImgformdata.append("title", data.info.title);
    cacheImgformdata.append("description", data.info.image);
    console.log(cacheImgformdata);
    let requestOptions = {
      method: 'POST',
      headers: cacheImgHeaders,
      body: cacheImgformdata,
      redirect: 'follow'
    };
    const resJson = await fetch("https://api.imgur.com/3/upload", requestOptions)
      .then(response => response.json())
      .catch(error => console.error('error', error));
    console.info('Cached');
    console.log(resJson.data);
    memoryCache.put(imgCacheKey, resJson.data.link);
    writeImageCache({ source: data.url, url: resJson.data.link });
  }
  return memoryCache.get(imgCacheKey);
}

module.exports = {
  saucenaoSearch,
  mkfd,
  pixivQuery,
  query2msg,
  cacheImage
};
