const { moduleName } = require("../shareData");

function pixiv(embed, target) {
	switch(target) {
		case 'uid':
			const regex = /[^[\]]+(?=])/g;
			return embed.fields[1].value.match(regex)[0];
	}
	return null;
}

module.exports = {
	pixiv
}