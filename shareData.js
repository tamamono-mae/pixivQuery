let opProps = {
  /* guildOwner txtmanager originalAuthor is_text everyone*/
  "help" : { perm: 0x1E },
  // 1 1 1 1 0
  "postImageInfo" : { perm: 0x1E , bit: 0 },
  // 1 1 1 1 0
  "urlSearch" : { perm: 0x1F , bit: 1 },
  // 1 1 1 1 1
  "imgSearch" : { perm: 0x1F , bit: 2 },
  // 1 1 1 1 1
  "status": { perm: 0x18 },
  "moduleSwitch": { perm: 0x18 },
  "setReaction": { perm: 0x18 },
  // 1 1 0 0 0
  "removeEmbedMsg": { perm: 0x1C },
  // 1 1 1 0 0
  "turnPage": { perm: 0x1F }
  // 1 1 1 1 1
}

let moduleName = [
  "getImageInfos", "urlSearch", "imgSearch"
]

module.exports = { opProps, moduleName };
