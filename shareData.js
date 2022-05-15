const configPath = "../env/config5.json";
const permission = {
	botSendMessage: 412384349248n,
	botManageMassage: 534790925376n,
	userManageMassage: 8192n
}

const opProps = {
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
	"registerCommand": { perm: 0x18 },
	"managerRoleOp": { perm: 0x18 },
	// 1 1 0 0 0
	"removeEmbedMsg": { perm: 0x1C },
	// 1 1 1 0 0
	"turnPage": { perm: 0x1F }
	// 1 1 1 1 1
}

const commands = [
	{
		name: 'help',
		description: 'Showing all available commands.',
		defaultPermission: false
	},
	{
		name: 'status',
		description: 'Showing configuration of current channal and guild.',
		defaultPermission: false
	},
	{
		name: 'fn',
		description: 'Activing or deactiving a function.',
		defaultPermission: false,
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
				name: 'default',
				description: 'Modifying default setting.',
				required: true,
				type: 5
			},
		]
		
	},
	{
		name: 'set-reaction',
		description: 'Assigning a reaction to result.',
		defaultPermission: false,
		options: [{
			name: 'reaction',
			description: 'Reaction',
			required: true,
			type: 3
		}]
	},
	{
		name: 'manager',
		description: 'Add or remove a role that can modify this application.',
		defaultPermission: false,
		options: [
			{
				name: 'action',
				description: 'Action',
				required: true,
				type: 3,
				choices: [
					{ name: 'Add', value: 'add' },
					{ name: 'Remove', value: 'remove' }
				]
			},
			{
				name: 'role',
				description: 'Role',
				required: true,
				type: 8
			}
		]
	}
]

const globalCommands = [
	{
		name: 'initialize',
		description: 'Registering slash commands in current guild.',
		defaultPermission: undefined
	}
]

const moduleName = [
	"getImageInfos", "urlSearch", "imgSearch"
]

const functionName = [
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

const webIcons = {
	pixiv: "https://i.imgur.com/TXMzn64.png"
}

const webIcon2Types = {
	"https://i.imgur.com/TXMzn64.png": "pixiv"
}

module.exports = {
	configPath,
	opProps,
	functionName,
	moduleName,
	commands,
	globalCommands,
	permission,
	helpEmbed,
	webIcons,
	webIcon2Types
};
