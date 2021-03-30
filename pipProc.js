/*
sudo mount -t vboxsf -o uid=$UID,gid=$(id -g)
instruction fetch >> authtication (iP/oP) >> process >> resultCheck >> response
function embedMessage
  查詢pixiv => embedMessage
function 查圖
  查詢Saucenao
  if 相似度 > 90
    if url符合pixiv pattern => embedMessage
    if url符合twitter pattern => normalMessage
      else normalMessage
訊息內容符合pixiv pattern => embedMessage
訊息內容符合picture file pattern=>
  function 查圖
訊息內容是附加檔案
  if附加檔案url符合picture file pattern=>
    function 查圖
*/
const config = require("../token/config3.json");
let textInstructionSet = {
  "pixiv" : {
    "patt": /^.*\.pixiv\..*\/(\d+)/i ,
    "opCode": "textQuery",
    "varMap": {
      "pixivID": 1
    }
  },
  "pixivE": {
    "patt": /^.*\.pixiv\..*member_illust\.php.*illust_id=(\d+)/i ,
    "opCode": "textQuery",
    "varMap": {
      "pixivID": 1
    }
  },
  "urlQuery": {
    "patt": /^(https|http):\/\/(.+)(.jpg|.png)/i ,
    "opCode": "urlQuery",
    "varMap": {
      "url": 1
    }
  },
  "moduleSwitch": {
    "patt": new RegExp(`^${config.prefix} (.+) (enable|disable)`,'i'),
    "opCode": 'moduleSwitch',
    "varMap": {
      "botModule": 1,
      "operation": 2
    }
  },
  "noOperation": {
    "patt": new RegExp(`.*`,'i'),
    "opCode": 'noOperation',
    "varMap": {}
  }
};
/*
網址自動查圖
以圖查圖
設定模組
刪除
翻頁
*/
let permissionOpCode = {
  /* guildOwner txtmanager srcMessageUser member */
  "textQuery" : { perm: 0xF , bit: 0},
  "urlQuery" : { perm: 0xF , bit: 1},
  "imgQuery" : { perm: 0xF , bit: 2},
  "moduleSwitch": { perm: 0xC },
  "removeEmbedMsg": { perm: 0xE },
  "pageSwitch": { perm: 0xF }
}

function instructionDecode(msg) {
  return new Promise((resolve, reject) => {
    if(!msg) reject('No instruction!')
    for (i=0;i<Object.keys(textInstructionSet).length;i++){
      if (msg.match(Object.values(textInstructionSet)[i]['patt'])){
        data = {};
        Object.keys(Object.values(textInstructionSet)[i]['varMap']).forEach((index) => {
          //data[index] = msg.match(Object.values(textInstructionSet)[i]['patt'])[Object.values(textInstructionSet)[i]['varMap'][index]];
          data[index] = msg.match(Object.values(textInstructionSet)[i]['patt'])[Object.values(textInstructionSet)[i]['varMap'][index]];
        })
        break;
      }
    }
    resolve({
      "opCode": Object.values(textInstructionSet)[i]['opCode'],
      "data": data
    });
  });
}

function permissionCheckUser(opCode, messageObject, authorId) {
  p = ((messageObject.channel.guild.ownerID == messageObject.author.id ? 0x8:0)
    | (messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(0x2000) ? 0x4:0)
    | (messageObject.author.id == authorId ? 0x2:0)
    | 1) & permissionOpCode[opCode]['perm'];
  r = 0;
  for(i=0;i<4;i++){
    r = ((p >> i) & 1) | r;
  }
  return (r == 1);
}

function permissionCheckBot(opCode, messageObject, functionEnable = 0xF) {  
  return (
    //sendMessage
    messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(0x4800)
    //moduleEnable
    & ((functionEnable >> permissionOpCode[opCode]['bit']) & 1)
    //manageMessage
    | (messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(0x2000) ? 2 : 0)
  );
}

module.exports = { instructionDecode, permissionCheckUser, permissionCheckBot };
