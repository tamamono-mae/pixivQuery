const npath = require('path');
const config = require(require("./shareData.js").configPath);
const a = require("./app.js");
const sd = require("./shareData.js");
const dbop = require("./dbOperation.js");
const dbCache = require('memory-cache');
const { checkParameterUndfeind, rejectInteration } = require('./fn.js');

let switchOrderList = [
	{
		patt: /^.*\.pixiv\.net\/(artworks|en\/artworks)\/(?<uid>\d+)/i,
		action: a.postImageInfo,
		varExt: { opCode: "postImageInfo", website: "pixiv" }
	},
	{
		patt: /^.*\.pixiv\..*member_illust\.php.*illust_id=(?<uid>\d+)/i,
		action: a.postImageInfo,
		varExt: { opCode: "postImageInfo", website: "pixiv" }
	},
	{
		patt: /(?<url>^(https|http):\/\/(.+)(.jpg|.jpeg|.png))/i,
		action: a.urlSearch,
		varExt: { opCode: "urlSearch" }
	}
];

async function setConfig(client) {
	let messageObj = (client.message == null) ?
	client : client.message;
	let [guildSwitch , channelSwitch, reaction] = [null,null,null];
	if (!client.isDm) {
		[guildSwitch , channelSwitch, reaction] =
		await dbop.fetchConfig(messageObj);

	} else {
		[guildSwitch , channelSwitch, reaction] =
		[
			[config.defaultDMPermissionBitfield, false],
			[config.defaultDMPermissionBitfield, false],
			config.defaultReaction
		];
		client.isMessageManager = false;
	}
	client.guildSwitch = guildSwitch[0];
	client.guildFunctionIsDefault = guildSwitch[1];
	client.channelSwitch = channelSwitch[0];
	client.channelFunctionIsDefault = channelSwitch[1];
	client.configReaction = reaction;
}


function attachmentSwitchOrder(client) {
	let functionSwitch = client.guildSwitch & client.channelSwitch;
	let returnOrder = [];
	let item = {
		action: a.urlSearch,
		varExt: { opCode: "imgSearch" , urls: Array.from(client.attachments.values()) }
	}
	let numOfBit = sd.opProps[item.varExt.opCode]['bit'];
	let isOn = ( (functionSwitch >> numOfBit) & 1 ) == 1;
	if (isOn) returnOrder.push(item);

	return returnOrder;
}

function msgSwitchOrder(client) {
	let functionSwitch = client.guildSwitch & client.channelSwitch;
	let returnOrder = [];
	for(let i=0;i<switchOrderList.length;i++) {
		let item = switchOrderList[i];
		let numOfBit = sd.opProps[item.varExt.opCode]['bit'];
		let isOn = ( (functionSwitch >> numOfBit) & 1 ) == 1;
		if (isOn) returnOrder.push(item);
	}
	return returnOrder;
}

function adminCommandSwitchOrder(interaction) {
	if (permissionCheckUser(interaction, 'moduleSwitch', authorId = '0'))
		return [
			{
				cmd: 'set-reaction',
				action: a.setReaction,
				varKey: [ 'reaction' ],
				varExt: { opCode: "setReaction" }
			},
			{
				cmd: 'status',
				action: a.functionStatus,
				varKey: [],
				varExt: {
					opCode: "status",
					color: config.colors[0],
					thumbnail: config.thumbnail
				}
			},
			{
				cmd: 'fn',
				action: a.functionConfig,
				varKey: [ 'name', 'enable' ],
				varExt: { opCode: "functionConfig" }
			},
			{
				cmd: 'initialize',
				action: a.registerCommand,
				varKey: [],
				varExt: { opCode: "registerCommand" }
			},
			{
				cmd: 'manager',
				action: a.managerRoleOp,
				varKey: [ 'action', 'role' ],
				varExt: { opCode: "managerRoleOp" }
			}
		];
	return [];
}

function permissionCheckBot(client) {
	let messageObject = {};
	switch(client.objType) {
		case 'message':
			messageObject = client;
		break;
		case 'commandInteraction':
			messageObject = client;
		break;
		case 'reaction':
			messageObject = client.message;
		break;
	}

	return [
		//sendMessage
		messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(sd.permission.botSendMessage),
		//manageMessage
		messageObject.channel.permissionsFor(messageObject.channel.guild.me).has(sd.permission.botManageMassage)
	]
}

function permissionCheckUser(client, opCode, authorId = '0') {
	let p;
	const managerRoles = dbCache.get('managerRoles_guildId'+client.guild.id);
	const rolesCache = client.guild.roles.cache;
	const userID = (client.user == null) ? client.author.id : client.user.id;
	let m = (userID == client.guild.ownerId);
	if(managerRoles != null)
		for(let i=0; i<managerRoles.length; i++){
			if(m) break;
			m = rolesCache.get(managerRoles[i]).members.has(client.user.id);
		}
	//console.info('[ info ] ' + userID + ' is ' + (m ? 'a' : 'not a') + ' manager.');
	if (!client.isDm) {
		p = ((client.channel.guild.ownerID == userID ? 0x10:0)
			| (m ? 0x8:0)
			| (userID == authorId ? 0x4:0)
			| 0x3) & sd.opProps[opCode]['perm'];
	} else {
		p = ((client.objType == 'message') ? 0x1 : 0x5) & sd.opProps[opCode]['perm'];
	}

	let r = 0;
	for(i=0;i<4;i++){
		r = ((p >> i) & 1) | r;
	}
	return (r == 1);
}

function cmdRouter(interaction) {
	let route = [
		//...commonCommandSwitchOrder(interaction),
		...adminCommandSwitchOrder(interaction),
		{
			cmd: 'help',
			action: a.helpMessage,
			varKey: [],
			varExt: {
				opCode: "help",
				color: config.colors[1],
				thumbnail: config.thumbnail,
				description: config.commandDescription
			}
		}
	];
	for (let i=0;i<route.length;i++) {
		//Match command
		let currRoute = route[i];
		if (route[i].cmd != interaction.commandName) continue;
		//Pre-process
		let props = {};
		for (let j=0;j<Object.keys(route[i]['varExt']).length;j++) {
			props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
		}
		//Check permission
		let checkPermissionResult = permissionCheckUser(interaction, currRoute.varExt.opCode);
		if (!checkPermissionResult) {
			rejectInteration(interaction, 'userPermission');
			return;
		};
		checkPermissionResult = permissionCheckBot(interaction);
		if (!checkPermissionResult[0]) {
			rejectInteration(interaction, 'botPermission');
			return;
		};
		//Check parameter exist
		let parameterUndfeind = checkParameterUndfeind(interaction, route[i].varKey);
		if(parameterUndfeind.length > 0) {
			let j;
			let errorString = '[ ERR  ] Parameter not found ! ';
			for(j=0; j< (parameterUndfeind.length -1) ; j++) {
				errorString += parameterUndfeind[j] + ', ';
			}
			errorString += parameterUndfeind[++j];
			rejectInteration(interaction, 'invalidParameter');
			throw errorString;
		}
		//pre-process 2
		interaction.isMessageManager = checkPermissionResult[1];
		/*
		if (match.middleware) {
			match.middleware(client);
		}
		*/
		//Start action
		return currRoute.action(interaction, props);
	}
}

function msgRouter(messageObj) {
	let message = messageObj.content;
	let route = [
		...msgSwitchOrder(messageObj),
	];
	//let matchRoute = route.find((route) => message.match(route.patt));
	for (let i=0;i<route.length;i++) {
		let currRoute = route[i];
		let regexResult = currRoute.patt.exec(message);
		if (!regexResult) continue;

		let props = {};
		if (regexResult.groups != null)
		for (let j=0;j<Object.keys(regexResult.groups).length;j++) {
			props[Object.keys(regexResult.groups)[j]] = Object.values(regexResult.groups)[j];
		}

		for (let j=0;j<Object.keys(route[i]['varExt']).length;j++) {
			props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
		}

		let checkPermissionResult = permissionCheckUser(messageObj, currRoute.varExt.opCode);
		if (!checkPermissionResult) throw new Error("Permission denied");
		checkPermissionResult = permissionCheckBot(messageObj);
		if (!checkPermissionResult[0]) throw new Error("Permission of bot denied, exit!");
		messageObj.isMessageManager = checkPermissionResult[1];
		/*
		if (match.middleware) {
			match.middleware(client);
		}
		*/
		return currRoute.action(messageObj, props);
	}
}

function attachmentRouter(messageObj) {
	let attachments = Array.from(messageObj.attachments.values());
	let route = [
		...attachmentSwitchOrder(messageObj)
	];
	//let matchRoute = route.find((route) => message.match(route.patt));

	for (let i=0;i<route.length;i++) {
		let currRoute = route[i];
		let props = {};

		for (let j=0;j<Object.keys(route[i]['varExt']).length;j++) {
			props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
		}

		let checkPermissionResult = permissionCheckUser(messageObj, currRoute.varExt.opCode);
		if (!checkPermissionResult) throw new Error("Permission denied");
		checkPermissionResult = permissionCheckBot(messageObj);
		if (!checkPermissionResult[0]) throw new Error("Permission of bot denied, exit!");
		messageObj.isMessageManager = checkPermissionResult[1];
		/*
		if (match.middleware) {
			match.middleware(client);
		}
		*/
		return currRoute.action(messageObj, props);
	}
}

function btnRouter(interaction) {
	let route = [
		{
			patt: 'nextPage',
			action: a.turnPage,
			varExt: { opCode: "turnPage", isNext: true }
		},
		{
			patt: 'previousPage',
			action: a.turnPage,
			varExt: { opCode: "turnPage", isNext: false }
		},
		{
			patt: 'remove',
			action: a.removeEmbedMsg,
			varExt: { opCode: "removeEmbedMsg" }
		}
	];
	//let matchRoute = route.find((route) => message.match(route.patt));
	for (let i=0;i<route.length;i++) {
		let currRoute = route[i];
		if (interaction.customId != currRoute.patt) continue;

		let props = {};
		for (let j=0;j<Object.keys(route[i]['varExt']).length;j++) {
			props[Object.keys(route[i]['varExt'])[j]] = Object.values(route[i]['varExt'])[j];
		}
		let checkPermissionResult = permissionCheckUser(
			interaction, currRoute.varExt.opCode,
			interaction.cacheData.sourceUserId // this should use author id
		);
		if (!checkPermissionResult) {
			rejectInteration(interaction, 'buttonPermission');
			console.info("[ info ] User permission denied");
			return;
		};
		checkPermissionResult = permissionCheckBot(interaction);
		if (!checkPermissionResult[0]) throw new Error("Permission of bot denied, exit!");
		interaction.isMessageManager = checkPermissionResult[1];
		/*
		middleware() {
		}
		*/
		return currRoute.action(interaction, props);
	}
}

module.exports = {
	setConfig,
	msgRouter,
	cmdRouter,
	attachmentRouter,
	btnRouter
};
