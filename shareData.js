const configPath = "../token/config5.json";
const permission = {
  botSendMessage: 412384349248n,
  botManageMassage: 534790925376n,
  userManageMassage: 8192n
}

let opProps = {
  /* guildOwner txtmanager originalAuthor is_text everyone*/
  "help" : { perm: 0x1E },
  // 1 1 1 1 0
  "postImageInfo" : { perm: 0x1E , bit: 0 },
  "getImageInfo" : { perm: 0x1E , bit: 0 },
  // 1 1 1 1 0
  "urlSearch" : { perm: 0x1F , bit: 1 },
  // 1 1 1 1 1
  "imgSearch" : { perm: 0x1F , bit: 2 },
  // 1 1 1 1 1
  "status": { perm: 0x18 },
  "moduleSwitch": { perm: 0x18 },
  "functionConfig": { perm: 0x18 },
  "setReaction": { perm: 0x18 },
  // 1 1 0 0 0
  "removeEmbedMsg": { perm: 0x1C },
  // 1 1 1 0 0
  "turnPage": { perm: 0x1F }
  // 1 1 1 1 1
}

let commands = [
  {
    name: 'help',
    description: 'Show all available commands.',
    defaultPermission: undefined
  },
  {
    name: 'status',
    description: 'Show configuration of current channal and guild.',
    defaultPermission: undefined
  },
  {
    options: [
      {
        name: 'name',
        description: 'Function name',
        required: true,
        type: 3,
        choices: [
          { name: 'Get image infos', value: 'getImageInfo' },
          { name: 'Image search', value: 'imgSearch' },
          { name: 'URL search', value: 'urlSearch' }
        ]
      },
      {
        name: 'enable',
        description: 'Enable or disable',
        required: true,
        type: 5
      },
      {
        name: 'globally',
        description: 'Operation globally or not.',
        required: true,
        type: 5
      },
    ],
    name: 'fn',
    description: 'Turn on or close a function.',
    defaultPermission: undefined
  },
  {
    options: [{
      name: 'reaction',
      description: 'The gif category',
      required: true,
      type: 3
    }],
    name: 'set-reaction',
    description: 'Assign a reaction to result.',
    defaultPermission: undefined
  }
]

let moduleName = [
  "getImageInfos", "urlSearch", "imgSearch"
]

let functionName = [
  "getImageInfo", "urlSearch", "imgSearch"
]

const helpEmbed = {
  "title": "User commands",
  "description": "User commands",
  "color": 0,
  "thumbnail": {
    "url": ""
  }
};

module.exports = {
  configPath,
  opProps,
  functionName,
  moduleName,
  commands,
  permission,
  helpEmbed
};
