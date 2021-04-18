const fetch = require("node-fetch");
const cheerio = require("cheerio");
const formData = require("form-data");
const { htmlToText } = require('html-to-text');
const config = require("../token/config3.json");
const webCache = require('memory-cache');

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

function saucenaoSearch(url){
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
    return (results.length > 0) ? checkUrls(results) : null ;
  })
}

function imgCount(pageCount,currentPage) {
  if(currentPage <= pageCount && pageCount > 1)
    return '-' + currentPage;
  else return pageCount > 1 ? "-1" : "";
}

async function pixivQuery(illustId, currentPage){
  //var formdata = mkfd(url);
  if (webCache.get('pixiv_'+illustId) != null) {
    return webCache.get('pixiv_'+illustId);
  }
  let body = await fetch('https://www.pixiv.net/artworks/'+illustId)
  .then(res => res.text());
  let $ = cheerio.load(body);
  let data = ($("#meta-preload-data").length > 0) ? {
    "title": JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['illustTitle'],
    "description": htmlToText(JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['illustComment'],{
      tags: { 'a': { options: { ignoreHref: true } } },
      wordwrap: false
    }),
    "url": "https://www.pixiv.net/artworks/"+JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['illustId'],
    "name": JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['userName'],
    "userId": JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['userId'],
    "illustId": illustId,
    "timestamp": JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['createDate'].substr(0, 19)+'.000Z',
    "image": 'https://pixiv.cat/'+illustId+imgCount(JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['pageCount'], currentPage)+'.jpg',
    "thumbnail": JSON.parse($("#meta-preload-data").attr("content"))['user'][JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['userId']]['imageBig'].replace('pximg.net','pixiv.cat'),
    "pageCount": JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['pageCount'],
    "xRestrict": JSON.parse($("#meta-preload-data").attr("content"))['illust'][illustId]['xRestrict'],
    "currentPage": currentPage
  } : null;
  webCache.put('webCache_pixiv_'+data.illustId, data, config.cacheTimeout);
  return data;
}

function query2msg(data,type){
  switch (type) {
    case 'pixiv':
    return {
      "embed":
        {
          "title": data['title']+ (data['pageCount'] > 1 ? (' ('+data['currentPage']+'/'+data['pageCount']+')') : ''),
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
                }
              ],
              "author": {
                "name": data['name'],
                "url": "https://www.pixiv.net/users/"+data['userId'],
                "icon_url": "https://i.imgur.com/TXMzn64.png"
              },
              "timestamp": data['timestamp'],
              "image": {
                "url": data['image']
              },
              "thumbnail": {
                "url": data['thumbnail']
              }
          }
    }
    break;
    default:

  }
}

module.exports = { saucenaoSearch, mkfd, pixivQuery, query2msg };
