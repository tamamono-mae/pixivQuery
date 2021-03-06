const config = require(require("./shareData.js").configPath);
const dbCache = require('memory-cache');
const sd = require("./shareData.js");
const dbop = require("./dbOperation.js");
const fn = require("./fn.js");
const q = require("./webRequest.js");
const { emojis } = require("./emoji.json");
const { initGuildCmd } = require("./restRequest.js");
const base64 = require("./lib/base64.js");
const dumpEmbed = require("./lib/dumpEmbed.js");

async function postImageInfo(messageObject ,props) {
	let queryResult;
	switch (props.website) {
		case 'pixiv':
			queryResult = await q.pixivQuery(props.uid, 1);
			break;
		default:
			queryResult = null;
	}
	if (queryResult == null) throw new Error('[ warn ] meta-data not found!');
	if (messageObject.isMessageManager && !messageObject.deleted && !props.reserveOrg) {
		messageObject = await messageObject.delete();
	}
	//if (messageObject.isMessageManager) messageObject.suppressEmbeds(true);
	//Discord disable this function for bot.           ^^^^^^^^^^^^^^^
	//Use 'Fetch message' and check result instead.
	//post and get replyMessage first
	let replyContent = q.query2msg(queryResult, props.website);
	/* Remove Cache */

	if (config.imageCacheMethod > 0)
		replyContent.embeds[0].image.url = await q.cacheImage(queryResult);
	//Cache end
	replyContent["content"] =
	"This message was posted by\n" +
	messageObject.author.username + " (" + messageObject.author.id + ").";
	replyContent['components'] = [fn.makePageRow(queryResult)];
	let replyMessage = await messageObject.channel.send(replyContent);
	//add reaction in background
	replyMessage.configReaction = messageObject.configReaction;
	replyMessage.react(messageObject.configReaction);
	let dbWriteData = {
		time: Date.now(),
		sourceId: messageObject.id,
		sourceUserId: messageObject.author.id,
		sourceTimestamp: messageObject.createdTimestamp,
		sourceContent: base64.encode(messageObject.content),
		sourceChannelId: messageObject.channel.id,
		replyId: replyMessage.id,
		pageCount: queryResult.pageCount,
		currentPage: 1,
		type: props.website
	}
	let logInfo = {
			type: props.opCode,
			sourceId: dbWriteData.sourceId,
			sourceUserId: dbWriteData.sourceUserId,
			sourceTimestamp: dbWriteData.sourceTimestamp,
			sourceContent: dbWriteData.sourceContent,
			sourceChannelId: dbWriteData.sourceChannelId,
			replyId: dbWriteData.replyId,
			replyContent: replyContent
	}
	let cacheKey = 'cacheMsg_' + dbWriteData.replyId + '_' + dbWriteData.sourceChannelId;
	if (!messageObject.isDm) {
		dbWriteData['sourceGuildId'] = messageObject.guild.id;
		cacheKey += '_' + messageObject.guild.id;
		logInfo.sourceGuildId = messageObject.guild.id;
	}
	dbop.toCacheDB(dbWriteData);
	dbCache.put(cacheKey, dbWriteData, config.cacheTimeout);
	switch (props.opCode) {
		case 'imgSearch':
		case 'urlSearch':
			return logInfo;
		default:
			return [logInfo];
	}
}

function helpEmbedAdmin(descriptionAry, moduleName, color, thumbnail) {
	let helpMsg = {
		"title": "Manager commands",
		"description": "",
		"color": 0,
		"thumbnail": {
			"url": ""
		}
	};
	let modules = "";
	moduleName.forEach(item => {
		modules += "> `" + item + "`\n";
	});
	helpMsg.description =
	descriptionAry[0] + modules + descriptionAry[1];
	helpMsg.color = color;
	helpMsg.thumbnail.url = thumbnail;
	return { embeds: [helpMsg] };
}

function helpMessage(interaction ,props) {
	let adminContent = { embeds: [ sd.helpEmbed ] };
	if (interaction.channel.permissionsFor(interaction.user).has(8192n)) {
		adminContent.embeds.push(
		helpEmbedAdmin(
			props.description,
			sd.functionName,
			props.color,
			props.thumbnail
		).embeds[0]);
	};
	interaction.reply({
		...adminContent,
		ephemeral: true
	});

	let logInfo = {
		type: props.opCode,
		sourceId: interaction.id,
		sourceUserId: interaction.user.id,
		sourceTimestamp: interaction.createdTimestamp,
		sourceContent: interaction.commandName,
		sourceChannelId: interaction.channel.id,
		sourceGuildId: interaction.guild.id,
		replyContent: adminContent
	};
	return [logInfo];
}

function dmHelpMessage(messageObject ,props) {
	let adminContent = "";
	if (messageObject.channel.permissionsFor(messageObject.author).has(8192n)) {
		adminContent =
		helpEmbedAdmin(
			props.description,
			sd.moduleName,
			props.color,
			props.thumbnail
		);
		messageObject.author.send(adminContent);
	}
	//srcMessage.channel.send(messageContent);
	if (messageObject.isMessageManager) messageObject.delete();

	let logInfo = {
		type: props.opCode,
		sourceId: messageObject.id,
		sourceUserId: messageObject.author.id,
		sourceTimestamp: messageObject.createdTimestamp,
		sourceContent: messageObject.content,
		sourceChannelId: messageObject.channel.id,
		sourceGuildId: messageObject.guild.id,
		replyContent: adminContent
	};
	return [logInfo];
}

async function setReaction(interaction, props) {
	//dbLog['type'] = 'Config';
	//Process setting while checking passed.
	props.reaction = interaction.options.get('reaction').value;
	let targetEmoji;
	let parsedEmoji = fn.reactionParse(props.reaction);
	if(parsedEmoji != null)
		targetEmoji = interaction.guild.emojis.cache.get(parsedEmoji.groups.id);
	//Fetch if emoji been add after application start.
	if ((targetEmoji == null) && (parsedEmoji != null)) {
		let w;
		try {
			w = await interaction.guild.emojis.fetch(parsedEmoji.groups.id);
		} catch (e) {
			console.info('[ info ] ' + e.message);
		} finally {
			targetEmoji = w;
		}
	}
	let isValidUnicodeEmoji = emojis.includes(props.reaction);
	let isValidCustomEmoji = (targetEmoji != null);
	if (!(isValidUnicodeEmoji || isValidCustomEmoji)) {
		fn.rejectInteration(interaction, 'invalidEmoji');
		console.info('[ info ] ' + interaction.user.id + '/' +
		interaction.channel.id + '/' + interaction.guild.id +
		': Invalid emoji');
		return;
	}
	//Checking this emoji is exist in current guild !!!
	isValidCustomEmoji = isValidCustomEmoji ?
		(targetEmoji.guild.id == interaction.guild.id) : false;
	//There is a type is valid below this line.
	if(!(isValidUnicodeEmoji || isValidCustomEmoji)) {
		fn.rejectInteration(interaction, 'emojiUnusable');
		return;
	}
	let emojiChar = isValidCustomEmoji ? targetEmoji.id : props.reaction;
	if (emojiChar == interaction.configReaction) {
		fn.rejectInteration(interaction, 'noModification');
		throw new Error('[ info ] No modification made');
	}
	let writeData = { "reaction" : emojiChar };
	interaction.reply({
		content: props.reaction,
		ephemeral: true
	});
	dbop.toConfigDB(interaction, writeData);
	let logInfo = {
		type: props.opCode,
		sourceId: interaction.id,
		sourceUserId: interaction.user.id,
		sourceTimestamp: interaction.createdTimestamp,
		sourceContent: interaction.commandName,
		sourceChannelId: interaction.channel.id,
		sourceGuildId: interaction.guild.id
	};
	logInfo.operation = 'set ' + props.reaction;
	return [logInfo];
}

function dmModuleStatus(messageObject ,props) {
	let statusEmbed = {
		"title": "Status for modules in ",
		"description": "",
		"color": props.color,
		"thumbnail": {
				"url": props.thumbnail
			}
	};
	let moduleStatus = "???? ????\n";
	statusEmbed.title +=
	messageObject.guild.name + ' and ' + messageObject.channel.name;
	let [guildSwitch , channelSwitch] = [messageObject.guildSwitch , messageObject.channelSwitch];
	for(let i=0;i<sd.moduleName.length;i++) {
		moduleStatus +=
		((guildSwitch & 1) == 1 ? '???' : '???') + " " +
		((channelSwitch & 1) == 1 ? '???' : '???') + " " +
		sd.moduleName[i] + "\n";
		guildSwitch = guildSwitch >> 1 ;
		channelSwitch = channelSwitch >> 1 ;
	}
	statusEmbed.description = moduleStatus;
	messageObject.author.send({ embeds: [statusEmbed] });
	//====================== Change text command to slash command, reply ephemeral: true
	//messageObject.delete();

	let logInfo = {
		type: props.opCode,
		sourceId: messageObject.id,
		sourceUserId: messageObject.author.id,
		sourceTimestamp: messageObject.createdTimestamp,
		sourceContent: messageObject.content,
		sourceChannelId: messageObject.channel.id,
		sourceGuildId: messageObject.guild.id,
		replyContent: statusEmbed
	};
	return [logInfo];
}

function functionStatus(interaction ,props) {
	let statusEmbed = {
		"title": "Status for function in ",
		"description": "",
		"color": props.color,
		"thumbnail": {
				"url": props.thumbnail
			}
	};
	let moduleStatus = "???? ????\n";
	statusEmbed.title +=
	interaction.guild.name + ' and ' + interaction.channel.name;
	let [guildSwitch , channelSwitch] = [interaction.guildSwitch , interaction.channelSwitch];
	for(let i=0;i<sd.functionName.length;i++) {
		moduleStatus +=
		((guildSwitch & 1) == 1 ? '???' : '???') + " " +
		((channelSwitch & 1) == 1 ? '???' : '???') + " " +
		sd.functionName[i] + "\n";
		guildSwitch = guildSwitch >> 1 ;
		channelSwitch = channelSwitch >> 1 ;
	}
	statusEmbed.description = moduleStatus;
	interaction.reply({
		embeds: [statusEmbed],
		ephemeral: true
	});
	//====================== Change text command to slash command, reply ephemeral: true
	//messageObject.delete();

	let logInfo = {
		type: props.opCode,
		sourceId: interaction.id,
		sourceUserId: interaction.user.id,
		sourceTimestamp: interaction.createdTimestamp,
		sourceContent: interaction.commandName,
		sourceChannelId: interaction.channel.id,
		sourceGuildId: interaction.guild.id,
		replyContent: statusEmbed
	};
	return [logInfo];
}

function functionConfig(interaction, props) {
	//dbLog['type'] = 'Config';
	let check = false;
	//let botModule = objectCheck.content.split(" ")[1];
	// Check function name is not illigal.
	props.function = interaction.options.get('name').value;
	for (i=0;i<sd.functionName.length;i++) {
		if (props.function.match(new RegExp(`^${sd.functionName[i]}`,'gm')) != null){
			check = true;
			break;
		}
	}
	if (!check) {
		interaction.reply({
			content: 'Incorrect function name',
			ephemeral: true
		});
		throw new Error('[ info ] Incorrect function name');
	}
	props.isDefault = interaction.options.get('default').value;
	props.operation = interaction.options.get('enable').value;
	let functionSwitch = (props.isDefault) ? interaction.guildSwitch : interaction.channelSwitch;
	if (props.operation ==
		((
			(functionSwitch >> sd.opProps[props.function]['bit'] & 1)
		) == 1)) {
			interaction.reply({
				content: 'No modification made',
				ephemeral: true
			});
			throw new Error('[ info ] No modification made');
		}
	let writeData = {
			"functionSwitch" :(
				functionSwitch ^ (1 << sd.opProps[props.function]['bit'])
			)
		};
	interaction.reply({
		content: interaction.options.get('name').value + (props.operation ?   ' ???? ????' : ' ???? ???? ????'),
		ephemeral: true
	});
	dbop.toConfigDB(interaction, writeData, props.isDefault);

	let logInfo = {
		type: props.opCode,
		sourceId: interaction.id,
		sourceUserId: interaction.user.id,
		sourceTimestamp: interaction.createdTimestamp,
		sourceContent: interaction.content,
		sourceChannelId: interaction.channel.id,
		sourceGuildId: interaction.guild.id,
	};
	logInfo.operation =
		props.function +
		(props.operation ? ' enable' : ' disable') +
		(props.isDefault ? ' global' : '');
	return [logInfo];
}

function moduleSwitch(messageObject, props) {
	//dbLog['type'] = 'Config';
	let check = false;
	//let botModule = objectCheck.content.split(" ")[1];
	for (i=0;i<sd.moduleName.length;i++) {
		if (props.module.match(new RegExp(`^${sd.moduleName[i]}`,'gm')) != null){
			check = true;
			break;
		}
	}
	if (!check) {
		fn.replyConfigMessage(
			messageObject,
			'Incorrect module name',
			config.deleteMessageDelay
		);
		throw new Error('[ info ] Incorrect module name');
	}
	props.isDefault = (props.isDefault != null);
	props.operation = (props.operation.match(/enable/i) != null);
	let functionSwitch = (props.isDefault) ? messageObject.guildSwitch : messageObject.channelSwitch;
	if (props.operation ==
		((
			(functionSwitch >> sd.opProps[props.module]['bit'] & 1)
		) == 1)) {
			fn.replyConfigMessage(
				messageObject,
				'No modification made',
				config.deleteMessageDelay
			);
			throw new Error('[ info ] No modification made');
		}
	let writeData = {
			"functionSwitch" :(
				functionSwitch ^ (1 << sd.opProps[props.module]['bit'])
			)
		};
	fn.replyConfigMessage(
		messageObject,
		props.module +
		(props.operation ?
		' ???? ????' : ' ???? ???? ????'),
		config.deleteMessageDelay
	);
	dbop.toConfigDB(messageObject, writeData, props.isDefault);

	let logInfo = {
		type: props.opCode,
		sourceId: messageObject.id,
		sourceUserId: messageObject.author.id,
		sourceTimestamp: messageObject.createdTimestamp,
		sourceContent: messageObject.content,
		sourceChannelId: messageObject.channel.id,
		sourceGuildId: messageObject.guild.id,
	};
	logInfo.operation =
		props.module +
		(props.operation ? ' enable' : ' disable') +
		(props.isDefault ? ' global' : '');
	return [logInfo];
}

async function turnPage(interaction, props) {
	//Check illigal action
	let check = (
		props.isNext &&
		interaction.cacheData.currentPage < interaction.cacheData.pageCount &&
		interaction.cacheData.pageCount > 1
	) || (
		!props.isNext &&
		interaction.cacheData.currentPage > 1 &&
		interaction.cacheData.pageCount > 1
	);
	if (!check) {
		fn.rejectInteration(interaction, 'buttonUnexpected');
		return;
	}
	await interaction.update({
		components: [fn.disableAllButtons(interaction.message.components[0])]
	});
	let queryResult;
	interaction.cacheData.currentPage += fn.pageOffset(
		props.isNext
	);
	switch (interaction.cacheData.type) {
		case 'pixiv':
			// Dump pixiv uid from reply message.
			queryResult = await q.pixivQuery(
				dumpEmbed.pixiv(interaction.message.embeds[0], 'uid'),
				interaction.cacheData.currentPage
			);
			break;
		default: 
			throw new Error('Deny turn page due to unknown type !');
	}

	let replyContent = q.query2msg(
		queryResult,
		interaction.cacheData.type
	);

	if (config.imageCacheMethod > 0) {
		replyContent.embeds[0].image.url = await q.cacheImage(queryResult);
		await interaction.editReply({
			embeds: replyContent.embeds,
			components: [fn.makePageRow(queryResult)]
		});
	}
	if (config.imageCacheMethod == 0) {
		await interaction.editReply({
			embeds: replyContent.embeds,
			components: [fn.makePageRow(queryResult)]
		});
	}

	dbop.updateCurrentPage(interaction);
	//Update cache data
	let cacheKey = 'cacheMsg_' + interaction.message.id + '_' + interaction.message.channel.id;
	if (!interaction.isDm) {
		cacheKey += '_' + interaction.message.channel.guild.id;
	}
	dbCache.del(cacheKey);
	dbCache.put(cacheKey ,interaction.cacheData);

	let logInfo = {
		type: props.opCode,
		sourceId: interaction.message.id,
		sourceUserId: interaction.reactionCurrentUser,
		sourceTimestamp: interaction.rts,
		sourceContent: interaction.customId,
		sourceChannelId: interaction.message.channel.id,
	};
	if (!interaction.isDm)
		logInfo.sourceGuildId = interaction.message.guild.id;
	return [logInfo];
}

async function removeEmbedMsg(interaction, props) {
	const cacheData = interaction.cacheData;
	const isDm = interaction.isDm;
	/*
	if (srcMessage != null && interaction.isMessageManager)
		srcMessage.suppressEmbeds(false);
	*/
	dbop.deleteCacheDBData(cacheData);
	let cacheKey = 'cacheMsg_' + cacheData.replyId + '_' + cacheData.sourceChannelId;
	if (!isDm) {
		cacheKey += '_' + cacheData.sourceGuildId;
	}
	dbCache.del(cacheKey);

	let rinteraction = {
		reactionCurrentUser: interaction.reactionCurrentUser,
		isDm: interaction.isDm,
		rts: interaction.rts
	}
	let replyMessage = await interaction.message.delete();

	let logInfo = {
		type: props.opCode,
		sourceId: replyMessage.id,
		sourceUserId: rinteraction.reactionCurrentUser,
		sourceTimestamp: rinteraction.rts,
		sourceContent: replyMessage.embeds[0],
		sourceChannelId: replyMessage.channel.id,
	};
	if (!rinteraction.isDm)
		logInfo.sourceGuildId = replyMessage.guild.id;
	return [logInfo];
}

async function postUrl(messageObject ,props) {
	//if (messageObject.isMessageManager) messageObject.suppressEmbeds(true);
	//post and get replyMessage first
	props.urlContent =
	"This message was posted by\n" +
	messageObject.author.username +
	" (" + messageObject.author.id + ").\n" +
	props.urlContent;
	let replyMessage = await messageObject.channel.send({
		content: props.urlContent,
		components: [fn.makePageRow({ pageCount: 1 })]
	});
	//add reaction in background
	replyMessage.configReaction = messageObject.configReaction;
	replyMessage.react(messageObject.configReaction);
	dbWriteData = {
		time: Date.now(),
		sourceId: messageObject.id,
		sourceUserId: messageObject.author.id,
		sourceTimestamp: messageObject.createdTimestamp,
		sourceContent: base64.encode(messageObject.content),
		sourceChannelId: messageObject.channel.id,
		replyId: replyMessage.id,
		pageCount: 1,
		currentPage: 1,
		type: 'Other'
	}
	let logInfo = {
		type: props.opCode,
		sourceId: dbWriteData.sourceId,
		sourceUserId: dbWriteData.sourceUserId,
		sourceTimestamp: dbWriteData.sourceTimestamp,
		sourceContent: dbWriteData.sourceContent,
		sourceChannelId: dbWriteData.sourceChannelId,
		replyId: dbWriteData.replyId,
		replyContent: replyMessage.content
	}
	let cacheKey = 'cacheMsg_' + dbWriteData.replyId + '_' + dbWriteData.sourceChannelId;
	if (messageObject.guild != null) {
		dbWriteData['sourceGuildId'] = messageObject.guild.id;
		cacheKey += '_' + messageObject.guild.id;
		logInfo.sourceGuildId = messageObject.guild.id;
	}
	dbop.toCacheDB(dbWriteData);
	dbCache.put(cacheKey, dbWriteData, config.cacheTimeout);
	return logInfo;
}

function urlSearch(messageObject, props) {
	let urlPool = [];
	let promisePool = [];
	let pattern = new RegExp(`(?<url>^(https|http):\/\/(.+)(.jpg|.jpeg|.png))`,'i');
	if (props.opCode == 'imgSearch') {
		for (let i=0;i<props.urls.length;i++) {
			if (props['urls'][i]['attachment'].match(pattern) != null)
				urlPool.push(props['urls'][i]['attachment']);
		}
	}
	if (props.opCode == 'urlSearch') {
		let tempPool = messageObject.content.split("\n");
		for (let i=0;i<tempPool.length;i++) {
			if (tempPool[i].match(pattern) != null)
				urlPool.push(tempPool[i]);
		}
	}
	for (let i=0;i<urlPool.length;i++)
		promisePool.push(q.saucenaoSearch(urlPool[i]));
	return Promise.all(promisePool).then(searchResult => {
		let promisePool = [];
		//Remove duplicates and null from searchResult
		searchResult = Array.from(new Set(searchResult)).filter(item => item != null);
		if (searchResult.length == 0) throw new Error('No result');
		for (let i=0;i<searchResult.length;i++) {
			let subProps = {
				opCode: props.opCode,
				urlContent: searchResult[i],
				reserveOrg: true
			};
			if (fn.urlDump(searchResult[i]) != null) {
				subProps.uid = fn.urlDump(searchResult[i]).uid;
				subProps.website = fn.urlDump(searchResult[i]).website;
				promisePool.push(postImageInfo(messageObject, subProps));
			}
			else {
				promisePool.push(postUrl(messageObject, subProps));
			}
		}
		return Promise.all(promisePool);
	}).then(logArray => {
		if(messageObject != null && !messageObject.deleted && messageObject.isMessageManager)
			messageObject.delete();
		return logArray;
	});
}

async function registerCommand(interaction, props) {
	let managerRoles = await dbop.getManagerRole(interaction.guild.id);
	//Filter
	let guildRoles = Array.from(interaction.guild.roles.cache.keys());
	managerRoles = managerRoles.filter(
		values => guildRoles.includes(values)
	);
	initGuildCmd(interaction.guild, managerRoles);
	interaction.reply({
		content: 'Done !',
		ephemeral: true
	});
}

async function managerRoleOp(interaction, props) {
	let targetRole = interaction.options.get('role').value;
	let roleList = await dbop.getManagerRole(interaction.guild.id);
	switch(interaction.options.get('action').value) {
		case 'add':
			if(!interaction.guild.roles.cache.has(targetRole)){
				fn.rejectInteration(interaction, 'roleNotInGuild');
				return;
			}
			if(roleList.includes(targetRole)){
				fn.rejectInteration(interaction, 'roleExistInDb');
				return;
			}
			await dbop.managerRoleDb(interaction, true, targetRole);
			interaction.reply({
				content: 'This role has been manager now.',
				ephemeral: true
			});
			roleList.push(targetRole);
		break;
		case 'remove':
			if(!roleList.includes(targetRole)){
				fn.rejectInteration(interaction, 'roleNotExistInDb');
				return;
			}
			await dbop.managerRoleDb(interaction, false, targetRole);
			interaction.reply({
				content: 'This role has been remove from manager list.',
				ephemeral: true
			});
			roleList = roleList.filter(value => value != targetRole);
		break;
		default:
			fn.rejectInteration(interaction, 'invalidParameter');
	}
	initGuildCmd( interaction.guild, roleList );
}

module.exports = {
	postImageInfo,
	helpMessage,
	dmHelpMessage,
	setReaction,
	dmModuleStatus,
	functionStatus,
	moduleSwitch,
	functionConfig,
	turnPage,
	removeEmbedMsg,
	urlSearch,
	registerCommand,
	managerRoleOp
};
