Polymer('rtc-app', {
	room: 'interconnect',
	host: location.href.indexOf('github.io') !== -1 ? 'http://rtc.io/switchboard/' : location.href.replace(/(^.*\/).*$/, "$1"),
	peers: null,
	myStream: null,
	myName: null,
	myStreamURI: null,
	mySnapshotURI: null,
	myVideo: null,
	startStream: function(peerID) {
		var me = this;
		var peer = me.getPeer(peerID);
		if ( !peer.streaming ) {
			var stream = me.myStream;
			console.log('start stream', peerID, stream);
			peer.connection.addStream(stream);

			//peer.removeAttribute('muted');
			//peer.setAttribute('streaming', '');
			peer.streaming = true;
			peer.muted = false;

			peer.sendMessage({
				action: 'started-stream'
			});
		}
	},
	stopStream: function(peerID) {
		var me = this;
		var peer = me.getPeer(peerID);
		if ( peer.streaming ) {
			var stream = me.myStream;
			console.log('stop stream', peerID, stream);
			peer.connection.removeStream(stream);

			//peer.removeAttribute('streaming');
			//peer.setAttribute('muted', '');
			peer.streaming = false;
			peer.muted = true;

			peer.sendMessage({
				action: 'stopped-stream'
			});
		}
	},
	getPeer: function(peerID) {
		var me = this;
		var peer = me.peers[peerID] || null;
		if ( peer === null ) {
			// Create peer
			peer = document.createElement('rtc-person');
			peer.sendMessage = function(data) {
				console.log('send message', data, 'to', peerID, 'FAILED as data channel has not opened yet');
			};
			me.peers[peerID] = peer;
			me.$.people.appendChild(peer);
		}
		return peer;
	},
	destroyPeer: function(peerID) {
		var me = this;
		var peer = me.peers[peerID] || null;
		if ( peer) {
			peer.parentNode.removeChild(peer);
			delete me.peers[peerID];
		}
		return null;
	},
	getName: function(){
		var me = this;
		while ( !me.myName ) {
			me.myName = prompt('What is your name?');
		}
		me.sendMessage({
			action: 'meta',
			meta: {
				name: me.myName
			}
		});
	},
	sendMessage: function(data){
		var me = this;
		var message = JSON.stringify(data);
		Object.keys(me.peers).forEach(function(peerID){
			var peer = me.peers[peerID];
			peer.sendMessage(message);
		});
	},
	ready: function(){
		var me = this;
		me.peers = {};
		me.signaller = require('rtc-quickconnect')(me.host, {reactive: true, room: me.room, debug:false});
		me.signaller
			.createDataChannel('messages')
			.on('messages:open', function(peerChannel, peerID){
				var peer = me.getPeer(peerID);
				peer.channel = peerChannel;

				peer.sendMessage = function(data){
					if ( data.action !== 'snap' )  console.log('send message', data, 'to', peerID);
					var message = JSON.stringify(data);
					try {
						peer.channel.send(message);
					}
					catch (err) {
						console.log('send message', data, 'to', peerID, 'FAILED for reason', err);
					}
				};

				peer.sendMessage({
					action: 'meta',
					meta: {
						name: me.myName
					}
				});

				peer.channel.onmessage = function(event) {
					var data;

					try {
						data = JSON.parse(event.data || '{}') || {};
					}
					catch (err) {
						console.log('FAILED to parse the data', event.data, 'from event', event);
						return;
					}

					if ( data.action !== 'snap' )  console.log('received message', data, 'from', peerID);

					// console.log('remote stream', peerID, peer.connection.getLocalStreams(), peer.connection.getRemoteStreams());

					switch (data.action) {
						// Peer has sent us their latest meta data
						case 'meta':
							peer.name = (data.meta || {}).name;
							break;

						// Peer has sent their stream to us
						case 'started-stream':
							me.startStream(peerID);
							break;

						// Peer has cancelled their stream
						case 'stopped-stream':
							me.stopStream(peerID);
							break;

						// Peer has sent us their latest snapshot
						case 'snap':
							peer.snapshotURI = data.snapshotURI;
							break;
					}
				};
			})
			.on('peer:connect', function(peerConnection, peerID, data, monitor){
				console.log('connected to', peerID);
				var peer = me.getPeer(peerID);
				peer.className += 'peer';
				peer.streaming = false;
				peer.muted = false;
				peer.connection = peerConnection;
				peer.name = peer.id = peerID;

				peer.addEventListener('click', function(){
					if ( peer.streaming ) {
						me.stopStream(peerID);
					} else {
						me.startStream(peerID);
					}
				});

				peerConnection.onaddstream = function(event) {
					console.log('RECEIVED STREAM', 'from', peerID);
					peer.stream = event.stream;
					peer.streamURI = window.URL.createObjectURL(peer.stream);
					peer.stream.onended = function(){
						me.stopStream(peerId);
					};
					me.startStream(peerID);
				};

				peerConnection.onremovestream = function(event) {
					me.stopStream(peerId);
				};
			})
			.on('peer:leave', function(peerID){
				console.log('disconnected to', peerID);
				me.destroyPeer(peerID);
			});
	},
	mySnapshotURIChanged: function(oldValue, newValue){
		var me = this;
		if ( newValue ) {
			Object.keys(me.peers).forEach(function(peerID){
				var peer = me.peers[peerID];
				peer.sendMessage({
					action: 'snap',
					snapshotURI: newValue
				});
			});
		}
	}
});