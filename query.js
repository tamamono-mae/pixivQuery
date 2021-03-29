const fetch = require("node-fetch");
const cheerio = require("cheerio");
const formData = require("form-data");
const { htmlToText } = require('html-to-text');

async function saucenao(url){
  var formdata = mkfd(url);
  let body = await fetch('https://saucenao.com/search.php',
  {
    method: 'POST',
    headers: formdata.getHeaders(),
    body: formdata,
    redirect: 'follow'
  })
  .then(res => res.text());
  let $ = cheerio.load(body);
  //console.log($("*").html());
  return $("div[class='result']").length == 1 ?
      ":x: Low similarity" : $(".result .resulttable .resulttablecontent .resultcontentcolumn").find("a").eq(0).attr("href");

}

async function ascii2d(url){
  var formdata = mkfd(url);
  let body = await fetch('https://ascii2d.net/search/url/'+url)
  .then(res => res.text());
  let $ = cheerio.load(body);
  var i = ($("div.detail-box.gray-link").eq(0).find("a").eq(0).attr("href") == null) ? 1 : 0;
  var r;
  if ($("div.detail-box.gray-link").eq(0+i).find("small").text() == "twitter") r = $("div.detail-box.gray-link").eq(0+i).find("a").eq(0).attr("href");
  else if ($("div.detail-box.gray-link").eq(1+i).find("small").text() == "twitter") r = $("div.detail-box.gray-link").eq(1+i).find("a").eq(0).attr("href");
  else r = $("div.detail-box.gray-link").eq(0+i).find("a").eq(0).attr("href");
  return (r == null) ? ":x: Error" : r ;

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

function imgCount(pageCount,currentPage) {
  if(currentPage <= pageCount && pageCount > 1)
    return '-' + currentPage;
  else return pageCount > 1 ? "-1" : "";
}

async function pixivQuery(illustId, currentPage){
  //var formdata = mkfd(url);
  let body = await fetch('https://www.pixiv.net/artworks/'+illustId)
  .then(res => res.text());
  let $ = cheerio.load(body);
  return ($("#meta-preload-data").length > 0) ? {
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
          "color": data['xRestrict'] == 0 ? 4036607 : 13859410,
          "fields": [
            {
              "name": "作者 Pixiv",
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

module.exports = { saucenao, ascii2d, mkfd, pixivQuery, query2msg };
