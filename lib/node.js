'use strict';

require('./utils/logger.js');

var os = require('os');
var Web3 = require('web3');
var web3;
var async = require('async');
var _ = require('lodash');
var debounce = require('debounce');
var pjson = require('./../package.json');
var chalk = require('chalk');
var omsModel = require('./oms');

var ETH_VERSION,
	NET_VERSION,
	PROTOCOL_VERSION,
	API_VERSION,
	COINBASE;

var INSTANCE_NAME = process.env.INSTANCE_NAME;

var MAX_BLOCKS_HISTORY = 40;
var UPDATE_INTERVAL = 20000;
var PING_INTERVAL = 3000;
var MAX_HISTORY_UPDATE = 50;
var MAX_CONNECTION_ATTEMPTS = 50;
var CONNECTION_ATTEMPTS_TIMEOUT = 1000;



if (process.env.NODE_ENV === 'production' && INSTANCE_NAME === "") {
	console.error("No instance name specified!");
	process.exit(1);
}

console.info('   ');
console.info('   ', 'NET STATS CLIENT');
console.success('   ', 'v' + pjson.version);
console.info('   ');
console.info('   ');

function Node() {

	this.oms = new omsModel(process.env.OMS_WORKSPACE_ID, process.env.OMS_KEY);

	this.info = {
		name: INSTANCE_NAME || (process.env.EC2_INSTANCE_ID || os.hostname()),
		contact: (process.env.CONTACT_DETAILS || ""),
		coinbase: null,
		node: null,
		net: null,
		protocol: null,
		api: null,
		port: (process.env.LISTENING_PORT || 30303),
		os: os.platform(),
		os_v: os.release(),
		client: pjson.version,
		canUpdateHistory: true,
	};

	this.id = _.camelCase(this.info.name);

	this.stats = {
		active: false,
		mining: false,
		hashrate: 0,
		peers: 0,
		pending: 0,
		gasPrice: 0,
		block: {
			number: 0,
			hash: '?',
			difficulty: 0,
			totalDifficulty: 0,
			transactions: [],
			uncles: []
		},
		syncing: false,
		uptime: 0
	};

	this._lastBlock = 0;
	this._lastStats = JSON.stringify(this.stats);
	this._lastFetch = 0;
	this._lastPending = 0;

	this._tries = 0;
	this._down = 0;
	this._lastSent = 0;
	this._latency = 0;

	this._web3 = false;

	this._latestQueue = null;
	this.pendingFilter = false;
	this.chainFilter = false;
	this.updateInterval = false;
	this.pingInterval = false;
	this.connectionInterval = false;

	this._lastBlockSentAt = 0;
	this._lastChainLog = 0;
	this._lastPendingLog = 0;
	this._chainDebouncer = 0;
	this._chan_min_time = 50;
	this._max_chain_debouncer = 20;
	this._chain_debouncer_cnt = 0;
	this._connection_attempts = 0;
	this._timeOffset = null;

	this.startWeb3Connection();

	return this;
}

Node.prototype.startWeb3Connection = function () {
	console.info('Starting web3 connection');

	web3 = new Web3();
	web3.setProvider(new web3.providers.HttpProvider('http://' + (process.env.RPC_HOST || 'localhost') + ':' + (process.env.RPC_PORT || '8545')));

	this.checkWeb3Connection();
}

Node.prototype.checkWeb3Connection = function () {
	var self = this;

	if (!this._web3) {
		if (web3.isConnected()) {
			console.success('Web3 connection established');

			this._web3 = true;
			this.init();

			return true;
		}
		else {
			if (this._connection_attempts < MAX_CONNECTION_ATTEMPTS) {
				console.error('Web3 connection attempt', chalk.cyan('#' + this._connection_attempts++), 'failed');
				console.error('Trying again in', chalk.cyan(500 * this._connection_attempts + ' ms'));

				setTimeout(function () {
					self.checkWeb3Connection();
				}, CONNECTION_ATTEMPTS_TIMEOUT * this._connection_attempts);
			}
			else {
				console.error('Web3 connection failed', chalk.cyan(MAX_CONNECTION_ATTEMPTS), 'times. Aborting...');
			}
		}
	}
}

Node.prototype.reconnectWeb3 = function () {
	console.warn("Uninstalling filters and update interval");

	this._web3 = false;
	this._connection_attempts = 0;

	if (this.updateInterval)
		clearInterval(this.updateInterval);

	try {
		web3.reset(true);
	}
	catch (err) {
		console.error("Web3 reset error:", err);
	}

	console.info("Web3 reconnect attempts started");

	this.checkWeb3Connection();
}

Node.prototype.emit = function (message, payload) {
	this.oms.postJson(message, JSON.stringify(payload));
}

Node.prototype.getInfo = function () {
	console.info('==>', 'Getting info');
	console.time('Got info');

	try {
		this.info.coinbase = web3.eth.coinbase;
		this.info.node = web3.version.node;
		this.info.net = web3.version.network;
		this.info.protocol = web3.toDecimal(web3.version.ethereum);
		this.info.api = web3.version.api;

		console.timeEnd('Got info');
		console.info(this.info);

		return true;
	}
	catch (err) {
		console.error("Couldn't get version");
	}

	return false;
}

Node.prototype.setInactive = function () {
	this.stats.active = false;
	this.stats.peers = 0;
	this.stats.mining = false;
	this.stats.hashrate = 0;
	this._down++;

	this.setUptime();

	this.sendStatsUpdate(true);

	// Schedule web3 reconnect
	this.reconnectWeb3();

	return this;
}

Node.prototype.setUptime = function () {
	this.stats.uptime = ((this._tries - this._down) / this._tries) * 100;
}

Node.prototype.formatBlock = function (block) {
	if (!_.isNull(block) && !_.isUndefined(block) && !_.isUndefined(block.number) && block.number >= 0 && !_.isUndefined(block.difficulty) && !_.isUndefined(block.totalDifficulty)) {
		block.difficulty = block.difficulty.toString(10);
		block.totalDifficulty = block.totalDifficulty.toString(10);

		if (!_.isUndefined(block.logsBloom)) {
			delete block.logsBloom;
		}

		return block;
	}

	return false;
}

Node.prototype.getLatestBlock = function () {
	var self = this;

	if (this._web3) {
		var timeString = 'Got block in' + chalk.reset.red('');
		console.time('==>', timeString);

		web3.eth.getBlock('latest', false, function (error, result) {
			self.validateLatestBlock(error, result, timeString);
		});
	}
}

Node.prototype.validateLatestBlock = function (error, result, timeString) {
	console.timeEnd('==>', timeString);

	if (error) {
		console.error("xx>", "getLatestBlock couldn't fetch block...");
		console.error("xx>", error);

		return false;
	}

	var block = this.formatBlock(result);

	if (block === false) {
		console.error("xx>", "Got bad block:", chalk.reset.cyan(result));

		return false;
	}

	if (this.stats.block.number === block.number) {
		console.warn("==>", "Got same block:", chalk.reset.cyan(block.number));

		if (_.isEqual(JSON.stringify(this.stats.block), JSON.stringify(block)))
			return false;

		console.stats(this.stats.block);
		console.stats(block);
		console.warn("Blocks are different... updating block");
	}

	console.sstats("==>", "Got block:", chalk.reset.red(block.number));

	this.stats.block = block;
	this.sendBlockUpdate();

	if (this.stats.block.number - this._lastBlock > 1) {
		var range = _.range(Math.max(this.stats.block.number - MAX_BLOCKS_HISTORY, this._lastBlock + 1), Math.max(this.stats.block.number, 0), 1);

		if (this._latestQueue.idle())
			this.getHistory({ list: range });
	}

	if (this.stats.block.number > this._lastBlock) {
		this._lastBlock = this.stats.block.number;
	}
}

Node.prototype.getStats = function (forced) {
	var self = this;
	var now = _.now();
	var lastFetchAgo = now - this._lastFetch;
	this._lastFetch = now;

	if (this._web3 && (lastFetchAgo >= UPDATE_INTERVAL || forced === true)) {
		console.stats('==>', 'Getting stats')
		console.stats('   ', 'last update:', chalk.reset.cyan(lastFetchAgo));
		console.stats('   ', 'forced:', chalk.reset.cyan(forced === true));

		async.parallel({
			peers: function (callback) {
				web3.net.getPeerCount(callback);
			},
			mining: function (callback) {
				web3.eth.getMining(callback);
			},
			hashrate: function (callback) {
				web3.eth.getHashrate(callback);
			},
			gasPrice: function (callback) {
				web3.eth.getGasPrice(callback);
			},
			syncing: function (callback) {
				web3.eth.getSyncing(callback);
			}
		},
			function (err, results) {
				self._tries++;

				if (err) {
					console.error('xx>', 'getStats error: ', err);

					self.setInactive();

					return false;
				}

				results.end = _.now();
				results.diff = results.end - self._lastFetch;

				console.sstats('==>', 'Got getStats results in', chalk.reset.cyan(results.diff, 'ms'));

				if (results.peers !== null) {
					self.stats.active = true;
					self.stats.peers = results.peers;
					self.stats.mining = results.mining;
					self.stats.hashrate = results.hashrate;
					self.stats.gasPrice = results.gasPrice.toString(10);

					if (results.syncing !== false) {
						var sync = results.syncing;

						var progress = sync.currentBlock - sync.startingBlock;
						var total = sync.highestBlock - sync.startingBlock;

						sync.progress = progress / total;

						self.stats.syncing = sync;
					} else {
						self.stats.syncing = false;
					}
				}
				else {
					self.setInactive();
				}

				self.setUptime();

				self.sendStatsUpdate(forced);
			});
	}
}

Node.prototype.getPending = function () {
	var self = this;
	var now = _.now();

	if (this._web3) {
		console.stats('==>', 'Getting Pending')

		web3.eth.getBlockTransactionCount('pending', function (err, pending) {
			if (err) {
				console.error('xx>', 'getPending error: ', err);
				return false;
			}

			var results = {};
			results.end = _.now();
			results.diff = results.end - now;

			console.sstats('==>', 'Got', chalk.reset.red(pending), chalk.reset.bold.green('pending tx' + (pending === 1 ? '' : 's') + ' in'), chalk.reset.cyan(results.diff, 'ms'));

			self.stats.pending = pending;

			if (self._lastPending !== pending)
				self.sendPendingUpdate();

			self._lastPending = pending;
		});
	}
}

Node.prototype.getHistory = function (range) {
	var self = this;

	var history = [];
	var interv = {};

	console.time('=H=', 'his', 'Got history in');

	if (_.isUndefined(range) || range === null)
		interv = _.range(this.stats.block.number - 1, this.stats.block.number - MAX_HISTORY_UPDATE);

	if (!_.isUndefined(range.list))
		interv = range.list;

	console.stats('his', 'Getting history from', chalk.reset.cyan(interv[0]), 'to', chalk.reset.cyan(interv[interv.length - 1]));

	async.mapSeries(interv, function (number, callback) {
		web3.eth.getBlock(number, false, callback);
	},
		function (err, results) {
			if (err) {
				console.error('his', 'history fetch failed:', err);

				results = false;
			}
			else {
				for (var i = 0; i < results.length; i++) {
					results[i] = self.formatBlock(results[i]);
				}
			}

			self.emit('history', {
				id: self.id,
				history: results.reverse()
			});

			console.timeEnd('=H=', 'his', 'Got history in');
		});
}

Node.prototype.changed = function () {
	var changed = !_.isEqual(this._lastStats, JSON.stringify(this.stats));

	return changed;
}

Node.prototype.prepareBlock = function () {
	return {
		nodeHostName: os.hostname(),
		id: this.id,
		blockNumber: this.stats.block.number,
		blockHash: this.stats.block.hash,
		blockMiner: this.stats.block.miner,
		blockTimestamp: new Date(this.stats.block.timestamp * 1000).toISOString(),
	};
}

Node.prototype.preparePending = function () {
	return {
		id: this.id,
		stats: {
			pending: this.stats.pending
		}
	};
}

Node.prototype.prepareStats = function () {
	return {
		id: this.id,
		stats: {
			active: this.stats.active,
			syncing: this.stats.syncing,
			mining: this.stats.mining,
			hashrate: this.stats.hashrate,
			peers: this.stats.peers,
			gasPrice: this.stats.gasPrice,
			uptime: this.stats.uptime
		}
	};
}

Node.prototype.sendBlockUpdate = function () {
	this._lastBlockSentAt = _.now();
	console.stats("wsc", "Sending", chalk.reset.red("block"), chalk.bold.white("update"));
	this.emit('block', this.prepareBlock());
}

Node.prototype.sendPendingUpdate = function () {
	console.stats("wsc", "Sending pending update");
	this.emit('pending', this.preparePending());
}

Node.prototype.sendStatsUpdate = function (force) {
	if (this.changed() || force) {
		console.stats("wsc", "Sending", chalk.reset.blue((force ? "forced" : "changed")), chalk.bold.white("update"));
		var stats = this.prepareStats();
		this.emit('stats', stats);
	}
}

Node.prototype.setWatches = function () {
	var self = this;

	this.setFilters();

	this.updateInterval = setInterval(function () {
		self.getStats();
	}, UPDATE_INTERVAL);

	if (!this.pingInterval) {
		this.pingInterval = setInterval(function () {
			//self.ping();
		}, PING_INTERVAL);
	}

	web3.eth.isSyncing(function (error, sync) {
		if (!error) {
			if (sync === true) {
				web3.reset(true);
				console.info("SYNC STARTED:", sync);
			} else if (sync) {
				var synced = sync.currentBlock - sync.startingBlock;
				var total = sync.highestBlock - sync.startingBlock;
				sync.progress = synced / total;
				self.stats.syncing = sync;

				if (self._lastBlock !== sync.currentBlock) {
					self._latestQueue.push(sync.currentBlock);
				}
				console.info("SYNC UPDATE:", sync);
			} else {
				console.info("SYNC STOPPED:", sync);
				self.stats.syncing = false;
				self.setFilters();
			}
		} else {
			self.stats.syncing = false;
			self.setFilters();
			console.error("SYNC ERROR", error);
		}
	});
}

Node.prototype.setFilters = function () {
	var self = this;

	this._latestQueue = async.queue(function (hash, callback) {
		var timeString = 'Got block ' + chalk.reset.red(hash) + chalk.reset.bold.white(' in') + chalk.reset.green('');

		console.time('==>', timeString);

		web3.eth.getBlock(hash, false, function (error, result) {
			self.validateLatestBlock(error, result, timeString);

			callback();
		});
	}, 1);

	this._latestQueue.drain = function () {
		console.sstats("Finished processing", 'latest', 'queue');

		self.getPending();
	}

	this._debouncedChain = debounce(function (hash) {
		console.stats('>>>', 'Debounced');
		self._latestQueue.push(hash);
	}, 120);

	this._debouncedPending = debounce(function () {
		self.getPending();
	}, 5);

	try {
		this.chainFilter = web3.eth.filter('latest');
		this.chainFilter.watch(function (err, hash) {
			var now = _.now();
			var time = now - self._lastChainLog;
			self._lastChainLog = now;

			if (hash === null) {
				hash = web3.eth.blockNumber;
			}

			console.stats('>>>', 'Chain Filter triggered: ', chalk.reset.red(hash), '- last trigger:', chalk.reset.cyan(time));

			if (time < self._chan_min_time) {
				self._chainDebouncer++;
				self._chain_debouncer_cnt++;

				if (self._chain_debouncer_cnt > 100) {
					self._chan_min_time = Math.max(self._chan_min_time + 1, 200);
					self._max_chain_debouncer = Math.max(self._max_chain_debouncer - 1, 5);
				}
			}
			else {
				if (time > 5000) {
					self._chan_min_time = 50;
					self._max_chain_debouncer = 20;
					self._chain_debouncer_cnt = 0;
				}
				// reset local chain debouncer
				self._chainDebouncer = 0;
			}

			if (self._chainDebouncer < self._max_chain_debouncer || now - self._lastBlockSentAt > 5000) {
				if (now - self._lastBlockSentAt > 5000) {
					self._lastBlockSentAt = now;
				}

				self._latestQueue.push(hash);
			}
			else {
				self._debouncedChain(hash);
			}
		});

		console.success("Installed chain filter");
	}
	catch (err) {
		this.chainFilter = false;

		console.error("Couldn't set up chain filter");
		console.error(err);
	}

	try {
		this.pendingFilter = web3.eth.filter('pending');
		this.pendingFilter.watch(function (err, hash) {
			var now = _.now();
			var time = now - self._lastPendingLog;
			self._lastPendingLog = now;

			console.stats('>>>', 'Pending Filter triggered:', chalk.reset.red(hash), '- last trigger:', chalk.reset.cyan(time));

			if (time > 50) {
				self.getPending();
			}
			else {
				self._debouncedPending();
			}
		});

		console.success("Installed pending filter");
	}
	catch (err) {
		this.pendingFilter = false;

		console.error("Couldn't set up pending filter");
		console.error(err);
	}
}

Node.prototype.init = function () {
	// Fetch node info
	this.getInfo();

	// Set filters
	this.setWatches();
}

Node.prototype.stop = function () {
	if (this.updateInterval)
		clearInterval(this.updateInterval);

	if (this.pingInterval)
		clearInterval(this.pingInterval);

	web3.reset(false);
}

module.exports = Node;
