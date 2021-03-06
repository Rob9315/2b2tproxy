module.exports = { ini, input, login };
// commit test

//* import
const config = require('../config.json');
const Chunk = require('prismarine-chunk')(config.version);
const Vec3 = require('vec3');
const log = require('./log');

//* storage variables
var dimension;
var chunks = [];
var updatePackets = [];
var proxyClient;
var client;

//! temp specific packet storage
var map_chunk = [];
var block_change = [];

//* gets client Object
function ini(c) {
	client = c;
}

//* performs actions (like storing and relaying) for incoming packets
function input(packet) {
	relay(packet);
	var { data, meta } = packet;

	switch (meta.name) {
		case 'map_chunk':
			// saveChunkPackets(packet, map_chunk); //! temp
			//TODO save to world object - Done
			saveChunk(packet);
			break;
		case 'unload_chunk':
			// unload_chunk_packets(data);
			unload_chunk(data);
			break;
		case 'block_change':
			// saveChunkPackets(packet, block_change); //! temp
			applyBlockChange(data);
			break;
		//TODO add Entity storage
		default:
			if (
				!config.bad_packets.includes(meta.name) ||
				meta.name == 'update_time'
			) {
				savePacket(packet);
			}

			switch (meta.name) {
				case 'login':
					saveData(packet);
					setDimension();
					break;

				case 'difficulty':
					saveData(packet);
					break;

				case 'abilities':
					saveData(packet);
					break;

				case 'held_item_slot':
					saveData(packet);
					break;

				case 'position':
					saveData(packet);
					break;

				case 'game_state_change':
					saveData(packet, 'reason');
					break;

				case 'advancements':
					savePacket(packet);
					break;

				case 'update_health':
					saveData(packet);
					break;

				case 'experience':
					saveData(packet);
					break;

				case 'respawn':
					saveData(data);
					setDimension();
					break;
			}
			break;
	}
}

//* sends login information to the proxyClient
function login(newProxyClient) {
	//repeatPackets(newProxyClient)
	repeatLog(newProxyClient);
	newProxyClient.on('packet', (data, meta) => send({ data, meta }, client));
	proxyClient = newProxyClient;
	newProxyClient.on('end', () => {
		proxyClient = undefined;
	});
}

//! packet storage
function saveChunkPackets(packet, arr) {
	var { x, z } = packet.data;
	if (!arr[x]) {
		arr[x] = [];
	}
	arr[x][z] = packet;
}
function unload_chunk_packets(data) {
	var { x, z } = data;
	if (_exists(x, z, map_chunk)) {
		map_chunk[x][z] = null;
	}
	if (_exists(x, z, block_change)) {
		block_change[x][z] = null;
	}
}

//* good storage
function saveChunk(packet) {
	var { x, z, bitMap, chunkData, groundUp } = packet.data;
	if (!chunks[x]) {
		chunks[x] = [];
	}
	var chunk = new Chunk();
	chunk.load(chunkData, bitMap, dimension, groundUp);
	chunks[x][z] = chunk;
}
function unload_chunk(data) {
	chunks[data.chunkX][data.chunkZ] = null;
}
function applyBlockChange(data) {
	p = convert(data.location);
	chunks[p.x][p.z].setBlockStateId(p.pos, data.type);
}
function savePacket({ data, meta }) {
	//TODO add filtering
	var toadd = true;
	updatePackets.forEach((packet, index) => {
		if (packet.meta.name == meta.name) {
			updatePackets[index] = { data, meta };
			toadd = false;
		}
	});
	if (toadd) {
		updatePackets.push({ data, meta });
	}
}

//! bad sending
function repeatPackets(newProxyClient) {
	updatePackets.forEach(({ data, meta }) => {
		newProxyClient.write(meta.name, data);
	});
	map_chunk.forEach((arr) =>
		arr.forEach((packet) => {
			if (packet) {
				send(packet, newProxyClient);
			}
		})
	);
	block_change.forEach((arr) =>
		arr.forEach((packet) => {
			if (packet) {
				send(packet, newProxyClient);
			}
		})
	);
}

//* good sending
function buildChunkPacket({ x, z, chunk }) {
	var meta = { name: 'map_chunk' };
	var data = {
		x: x,
		z: z,
		groundUp: true,
		bitMap: chunk.getMask(),
		chunkData: chunk.dump(),
		blockEntities: [],
	};
	return { data, meta };
}
function relay(packet) {
	if (proxyClient) {
		send(packet, proxyClient);
	}
}
function repeatLog(newProxyClient) {
	updatePackets.forEach(({ data, meta }) => {
		newProxyClient.write(meta.name, data);
	});

	//* because forEach is apparently not good enough >:[
	for (const x in chunks) {
		if (chunks.hasOwnProperty(x)) {
			const arr = chunks[x];
			for (const z in arr) {
				if (arr.hasOwnProperty(z)) {
					const chunk = arr[z];
					if (chunk) {
						send(buildChunkPacket({ x, z, chunk }), newProxyClient);
					}
				}
			}
		}
	}
}

//* helper function(s)
function convert(pos) {
	x = Math.floor(pos.x / 16);
	z = Math.floor(pos.z / 16);
	pos = new Vec3(pos.x % 16, pos.y, pos.z % 16);
	if (pos.x < 0) {
		pos.x = pos.x + 16;
	}
	if (pos.z < 0) {
		pos.z = pos.z + 16;
	}
	return {
		x,
		z,
		pos,
	};
}
function send({ meta, data }, sender) {
	try {
		if (!config.bad_packets.includes(meta.name)) {
			sender.write(meta.name, data);
		}
	} catch (error) {
		log(error);
		log(meta.name);
		log(sender);
	}
}
function _exists(x, z, arr) {
	if (arr[x] && arr[x][z]) {
		return true;
	}
	return false;
}
function setDimension() {
	client.dimension = {
		'-1': 'minecraft:nether',
		0: 'minecraft:overworld',
		1: 'minecraft:the_end',
	}[client.dimension];
}

function saveData(packet, excludedData = {}) {
	for (const property in packet.data) {
		if (packet.hasOwnProperty(property) && !excludedData.includes(property)) {
			client[property] = packet[property];
		}
	}
}
