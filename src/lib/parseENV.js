function parseENV (orig_env) {
	let type = orig_env.split(":", 1)[0].toLowerCase();
	let data = orig_env.slice(type.length + 1);
	switch (type) {
		case  'string': return data;
		case     'int': return parseInt(data);
		case   'float': return parseFloat(data);
		case 'boolean': return data.toLowerCase() === 'true';
		case  'number': return Number(data);
	}
	return orig_env;
}

module.exports = parseENV;