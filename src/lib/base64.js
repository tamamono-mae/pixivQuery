function encode(str) {
	let buff = Buffer.from(str, 'utf-8');
	return buff.toString('base64');
}

function decode(base64) {
	let buff = Buffer.from(base64, 'base64');
	return buff.toString('utf-8');
}

module.exports = {
	encode,
	decode
};