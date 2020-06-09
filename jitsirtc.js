
let jitsirtc = null;
			
class JitsiWebRTC extends WebRTC {
	constructor(settings) {
		super(settings);

  }

  async initialize() {
    await this.client.initialize();	
	return this.connect(this);
  }
}

/**
 * WebRTC Client using the JitsiRTC framework for its implementation.
 *
 * @implements {WebRTCInterface}
 * @param {WebRTC} webrtc             The WebRTC object
 * @param {WebRTCSettings} settings   The WebRTC Settings object
 */
class JitsiRTCClient extends WebRTCInterface {
  constructor(webrtc, settings) {
    super(webrtc, settings);

	this._roomhandle = null;
	this._remoteTracks = {};
	this._videofilter = null;

	this._settings = settings;
	
	const server = this._settings["worldSettings"]["server"];
	this._room = this._settings["worldSettings"]["server"]["room"];
	
	if (server["type"] == "FVTT") {
		this._options = {
			hosts: {
				domain: 'beta.meet.jit.si',
				muc: 'conference.beta.meet.jit.si'
			},
			bosh: '//beta.meet.jit.si/http-bind',
			clientNode: 'http://beta.meet.jit.si'
		};
		this._auth = {}
	} else {
		this._options = {
			hosts: {
				domain: server["url"],
				muc: 'conference.' + server["url"],
				focus: 'focus.' + server["url"]
			},
			bosh: '//' + server["url"] + '/http-bind',
			clientNode: 'http://jitsi.org/jitsimeet',
		};
		this._auth = {
			id: server["username"],
			password: server["password"]
		}
	}
    
    this._usernameCache = {};
	this._idCache = {};
	this._withAudio = false;
	this._withVideo = false;
  }

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.log
   */
  debug(...args) {
    if (this.settings.debugClient)
      console.log("JitsiRTC : ", ...args);
  }

  getLocalTracks() {
	if (this._roomhandle) 
		 return this._roomhandle.getLocalTracks();
	return [];
  }

  getFilterCanvas() {
	if (this._videofilter)
		return this._videofilter.getFilterCanvas();
	return null;
  }

  hasActiveFilter() {
	if (this._videofilter)
		return this._videofilter.hasActiveFilter();
	
	return false;
  }

  setVideoFilter(filter) {
	  this._videofilter = filter;
  }

  async getVideoFilter() {
	if (this._videofilter)
		return await this._videofilter.getVideoFilter();
	
	return [];
  }

    async initialize() {
		
		const mode = this._settings["worldSettings"]["mode"];
		this._withAudio = ( (mode == 1) || (mode == 3));
		this._withVideo = ( (mode == 2) || (mode == 3));

		this.debug("initialize withAudio: ",this._withAudio," withVideo: ", this._withVideo);
		
		if (game.webrtc.client._withAudio || game.webrtc.client._withVideo) {	
			JitsiMeetJS.init(game.webrtc.client._options);	
			JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
			this.debug("JitsiMeetJS init with options ",game.webrtc.client._options);
		}

		return true;
  }

  /**
   * Connect to the Jitsi server.
   *
   * @param {string} host            ignored
   * @param {string} room            ignored
   * @param {string} username        ignored
   * @param {string} password        ignored
   * @return {Promise.boolean}       Returns success/failure to connect
   */
  async connect({ host, room, username, password } = {}) {
     return new Promise( (resolve) => {
     	 
		jitsirtc = new JitsiMeetJS.JitsiConnection(null, null,this._options);
		
		this.debug("Connection created with options ",this._options);
    
		jitsirtc.addEventListener(
			JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
			this._loginSuccess.bind(this, resolve));
		jitsirtc.addEventListener(
			JitsiMeetJS.events.connection.CONNECTION_FAILED,
			this._loginFailure.bind(this, resolve));
		jitsirtc.addEventListener(
			JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
			this._onDisconnect.bind(this, resolve));
		
		jitsirtc.connect(this._auth);

		this.debug("Async call to connect started.");
    
    });
  }
  
  uiUpdateNeeded() {
	  if (ui.webrtc && (ui.webrtc._state == 1)) {

		  setTimeout( function() { 
			game.webrtc.client.uiUpdateNeeded();			
		  
		  }, 2000);
	  } else {		 

		  ui.webrtc.render(true);
	  }
  }
  
	/**
	 * Handles incoming remote track
	 * @param track JitsiTrack object
	 */
	 _onRemoteTrack(track) {
		
		if (track.isLocal()) {
			return;
		}
		const participant = track.getParticipantId();
		const client = game.webrtc.client;
		
		client.debug("remote track type ",track.getType(), " from participant " , participant, " added.");
    
		if (client._remoteTracks[participant] == null) 
			client._remoteTracks[participant] = [];
		
		client._remoteTracks[participant].push(track);
		const userId = client._idCache[participant];
					
		if (userId != null) { 
				
				if (track.getType() === "video") {
					client.debug("onUserVideoStreamChange called after remote track added for UserId",userId);
					game.webrtc.onUserVideoStreamChange( userId,client.getRemoteStreamForId(participant));
				}
				if (track.getType() === "audio") {
					client.debug("onUserAudioStreamChange called after remote track added for UserId",userId);
					game.webrtc.onUserAudioStreamChange( userId,client.getRemoteStreamForId(participant));
				}
		
		} else {
			client.debug("Remote track of unknown participant ", participant, " added.");
		}
		client.debug("remote track add finished, type: ", track.getType(), " participant: " , participant);
	}


	/**
	 * Handles incoming lost remote track
	 * @param track JitsiTrack object
	 */
	 _onRemoteTrackRemove(track) {
		
		if (track.isLocal()) {
			return;
		}
		
		const participant = track.getParticipantId();
		const client = game.webrtc.client;
		client.debug("remote track type ",track.getType()," removed for participant ", participant);
		
		if (client._remoteTracks[participant] != null) {		

			client._remoteTracks[participant] = client._remoteTracks[participant].filter(function(value, index, arr){ 
				return value.ssrc != track.ssrc;});
			
			const userId = client._idCache[participant];
			
			if (userId != null) { 
					
					if (track.getType() === "video") {
						client.debug("onUserVideoStreamChange called after remote track removed for participant",participant);
						game.webrtc.onUserVideoStreamChange( userId,client.getRemoteStreamForId(participant));
					}
					if (track.getType() === "audio") {
						client.debug("onUserAudioStreamChange called after remote track removed for participant",participant);
						game.webrtc.onUserAudioStreamChange( userId,client.getRemoteStreamForId(participant));
					}					
			}
		}
	}

	getRemoteStreamForId(id) {
		let stream = new MediaStream();
		const tracks = game.webrtc.client._remoteTracks[id];

		if (tracks) {
			for (let i = 0; i <  tracks.length; i++) {		
				stream.addTrack(tracks[i].track);	
			}
			game.webrtc.enableStreamVideo(stream);
			return stream;
		}
		return null;
	}
 
	getRemoteStreamForUserId(userId) {
		const id = game.webrtc.client._usernameCache[userId];
		if (id != null) {
			return game.webrtc.client.getRemoteStreamForId( id );
		} 
		return null;
	}
	
	getStreamForUser(userId) {
		if (userId === game.userId) { 
			let stream = new MediaStream();
			const tracks = game.webrtc.client.getLocalTracks();
	
			for (let i = 0; i <  tracks.length; i++) {		
				stream.addTrack(tracks[i].track);	
			}	
			return stream;

		}
		return this.getRemoteStreamForUserId(userId);
   }

	async _onLocalTracks(resolve,tracks) {
		
		for (let i = 0; i <  tracks.length; i++) {
			const track = tracks[i];
	
			track.enabled = true;
			track.track.enabled = true;
			await game.webrtc.client._roomhandle.addTrack(track);	

			this.debug("local track ", track, " added.");

			if (  (track.getType() === "audio") && 
				(  (game.webrtc.settings.voiceMode === "ptt") || this.settings.users[game.user.id].muted)) {				
				game.webrtc.disableStreamAudio(this.getStreamForUser(game.userId));
			} else if ((track.getType() === "video") && (this.settings.users[game.user.id].hidden)) {
				game.webrtc.disableStreamVideo(this.getStreamForUser(game.userId));
			}

		}

		resolve(this.getStreamForUser(game.userId));
   } 
   
  setAudioOutput(video, audioSinkId) {
	  /*
	  const client = game.webrtc.client;
	  
	  if (client._remoteTracks != null) {
		  for(var p in client._remoteTracks) {
			  const t = client._remoteTracks[p];
			  if ( (t != null) && (t.length > 0)) {
				  for (let i = 0; i <  t.length; i++) {
					  if (t[i].getType() === "audio") {
						   
						   t[i].setAudioOutput(audioSinkId).then( () => {
						   console.log("Jitsi: AudioOutput set " + t[i].getParticipantId() + ":" +  t[i].getId() + ":" + audioSinkId);});
					  }
				  }
			  }
		  }
	  }
	  */
  
  }
 	
    assignStreamToVideo(stream, video) {
		this.debug("assignStreamToVideo stream:", stream, " video:", video);
		
		if ( stream ) {			
			
			try {
				video.srcObject = stream;
			} catch (error) {
				video.src = window.URL.createObjectURL(stream);
			}
		
			if (game.webrtc.client.hasActiveFilter() && $(video).hasClass("local-camera")) {
				$(video).parent().append( game.webrtc.client.getFilterCanvas() );
			}	  
		}
   }
  
	 _onUserLeft(id) {
		this.debug("user left: ",game.webrtc.client._idCache[id]);
		 game.webrtc.client._remoteTracks[ id ] = null;	
		 game.webrtc.client._usernameCache[ game.webrtc.client._idCache[id] ] = null;
		 game.webrtc.client._idCache[id] = null;
		 
		 game.webrtc.onUserStreamChange(game.webrtc.client._idCache[id], null);

	}

  /* -------------------------------------------- */

  /**
   * Connection success callback
   * @private
   */
  _loginSuccess(resolve) {

		this._roomhandle = jitsirtc.initJitsiConference(this._room, {
				openBridgeChannel: true,
				startSilent: false	,
				p2p: { 
					enabled:false
				}		
		});
		this.debug("conference joined: ", this._roomhandle);
		this._roomhandle.setDisplayName(game.userId);

		this._roomhandle.on(JitsiMeetJS.events.conference.CONFERENCE_ERROR , this._onConferenceError);
		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_ADDED, this._onRemoteTrack);
		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_REMOVED, this._onRemoteTrackRemove);
		this._roomhandle.on(
			JitsiMeetJS.events.conference.CONFERENCE_JOINED,
			this._onConferenceJoined.bind(this, resolve));
				
		this._roomhandle.on(JitsiMeetJS.events.conference.USER_JOINED, (id, participant) => {		
			game.webrtc.client._usernameCache[participant._displayName] = id;
			game.webrtc.client._idCache[id] = participant._displayName;
			game.webrtc.client._remoteTracks[id] = [];
			this.debug("user joined: ", participant._displayName);		
		});

		this._roomhandle.on(JitsiMeetJS.events.conference.USER_LEFT, this._onUserLeft.bind(this));
				
		this._roomhandle.join();
  }
	
  _onConferenceJoined(resolve) {
	  this.debug("conference joined event.");
		resolve(true);
	}

  _onConferenceError(errorCode) {
	this.debug("Conference error: ", errorCode);
	this.webrtc.onError(errorCode);
	resolve(false);
  }

	/**
   * Get the list of connected streams
   * The result would be an array of objects in the form of {id, pc, local, remote} where id is the user's ID and remote is
   * the remote user's stream.
   *
   * @return {Array.Object}
   */
   getConnectedStreams() {
	  let remoteStreams = [];
	  for(var u in game.webrtc.client._usernameCache) {
		  if (u != game.userId) {
			const id = game.webrtc.client._usernameCache[ u ];			
			remoteStreams.push( { id: u, remote: game.webrtc.client.getRemoteStreamForId( id ) } );		 
		  }
	  }
	  return remoteStreams;
  }

  /* -------------------------------------------- */

  /**
   * Connection failure callback
   * @private
   */
  _loginFailure(resolve, errorCode, message) {

    this.debug("Login ERROR ", errorCode, message);
    this.webrtc.onError(message);
    resolve(false);
  }

  /* -------------------------------------------- */

  /**
   * Setup the custom TURN relay to be used in subsequent calls if there is one configured
   * If configured, setup custom TURN configuration for future calls. Turn credentials are mandatory in WebRTC.
   * @private
   */
  _setupCustomTURN() {
    
  }

  /* -------------------------------------------- */

  /**
   * Disconnect from the signaling server, any existing calls will be terminated.
   * This is also called whenever the server configuration is changed.
   *
   * @return {Promise.boolean}       Returns success/failure to connect
   */
  async disconnect() {
	
	if (jitsirtc) {
		return new Promise(resolve => {
		
			jitsirtc.removeEventListener(
				JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
				this._loginSuccess.bind(this, resolve));
			jitsirtc.removeEventListener(
				JitsiMeetJS.events.connection.CONNECTION_FAILED,
				this._loginFailure.bind(this, resolve));
			jitsirtc.removeEventListener(
				JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
				this._onDisconnect.bind(this));
			  
			jitsirtc.disconnect();
			
		});
	} 
  }

  async initLocalStream(audioSrc, videoSrc, temporary=false) {
    return new Promise(async (resolve) => {

		const withAudio = this._withAudio && audioSrc;
		const withVideo = this._withVideo && videoSrc;
		let localtracks = game.webrtc.client.getLocalTracks();

		let audioFound = false;
		let videoFound = false;

		for (let i = 0; i <  localtracks.length; i++) {
			const track = localtracks[i];
			if ( track.getType() === "audio") {
				audioFound = true;
				if (!withAudio) {
					this.debug("Audio track dispose");
					track.dispose();					
						
				}
			}
			if ( track.getType() === "video") {
				videoFound = true;
				if (!withVideo) {
					this.debug("Video track dispose");
					track.dispose();
				}
			}
		}
		
		let devlist = [];
		if ( withAudio && !audioFound) devlist.push( 'audio' );
		if ( withVideo && !videoFound) devlist.push( 'video' );
		this.debug("Device list for createLocalTracks: ", devlist);

		if (devlist.length > 0) {

			JitsiMeetJS.createLocalTracks({ devices: devlist,resolution: 240,
				disableSimulcast: false,				
				cameraDeviceId : videoSrc,
				micDeviceId : audioSrc,
				effects : await game.webrtc.client.getVideoFilter(),
				constraints: {
						video: {
							aspectRatio: 4/3,
							height: {
								ideal: 240,
								max: 480,
								min: 120
							},
							width: {
								ideal: 320,
								max: 640,
								min: 160
							}

						}
					},
			})
			.then(await this._onLocalTracks.bind(this,resolve))
			.catch(error => {
				throw error;
			});
		} else {
			
			resolve(this.getStreamForUser(game.userId));
		}
    });
  }

  
  async closeLocalStream(temporary=false) {
	  
    
  }
  

  /* -------------------------------------------- */
  /*  Device Discovery                            */
  /* -------------------------------------------- */

  /**
   * Get the list of available video sources.
   * The expected result is an object with the device id as key and its human-readable label as value.
   * @return {Promise.Object}
   */
  async getVideoSources() {
	  	 
    return new Promise(resolve => {
      try {
		  JitsiMeetJS.mediaDevices.enumerateDevices(list => { resolve(this._deviceInfoToObject(list,'videoinput')) });
       
      } catch (err) {
        resolve({})
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the list of available audio sources.
   * The expected result is an object with the device id as key and its human-readable label as value.
   * @return {Promise.Object}
   */
  async getAudioSources() {
	  	  
    return new Promise(resolve => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices(list => resolve(this._deviceInfoToObject(list,'audioinput')));
      } catch (err) {
        resolve({})
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the list of available audio output devices
   * The expected result is an object with the device id as key and its human-readable label as value
   *
   * Note: This feature is not supported by Firefox by default as it depends on the enumerateDevices
   * API which doesn't list output devices on Firefox 63+ unless the media.setsinkid.enabled settings
   * is enabled.
   * See https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
   *
   * @return {Promise.Object}
   */
  async getAudioSinks() {
	 
	  return new Promise(resolve => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices(list => resolve(this._deviceInfoToObject(list,'audiooutput')));
      } catch (err) {
        resolve({})
      }
    });
  }
  
 /**
   * Transform the device info array from jitsirtc into an object with {id: label} keys
   * @param {Array} list    The list of devices
   * @private
   */
  _deviceInfoToObject(list,kind) {
	
	  
	const obj = {};
	for (let i = 0; i <  list.length; i++) {
		if ( list[i].kind === kind) {
			obj[list[i].deviceId] = list[i].label || game.i18n.localize("WEBRTC.UnknownDevice")
		}
	}
	
	return obj;
   
	
  }
  
 
 
  /* -------------------------------------------- */

  /**
   * Generic error callback.
   * Filter out bad ice candidate errors since they can happen often for various reasons and reporting them can only
   * serve to confuse players.
   * @private
   */
  _onError({ errorCode, errorText}) {
    this.debug("Error : ", ...arguments);
   
      game.webrtc.onError(errorText);
  }

  /* -------------------------------------------- */

  /**
   * Called when the connection to the signaling server is lost
   * @private
   */
  _onDisconnect() {
    this.debug("Disconnected", ...arguments);
    game.webrtc.onDisconnect();
  }

 

  /* -------------------------------------------- */

  /**
   * Notify of settings changes
   * This can be used to act according
   * @param {Object} changed     Object consisting of the changed settings in the form {key: value}
   */
  onSettingsChanged(changed) {

/* TODO
	*/
  }
  
}

Hooks.on("init", function() {
  
  CONFIG["WebRTC"].clientClass = JitsiRTCClient;
  CONFIG["debug"].avclient = true;
});

Hooks.on("setup", function() {
	
   WebRTC.prototype.initialize = async function () {
    return true;
  };

  
  WebRTC.prototype.isStreamAudioEnabled = function(stream) { 
	if (!stream) return false; 

	const tracks = stream.getAudioTracks();
	return tracks.some(t => t.enabled);
  };
  

   WebRTC.prototype.enableMicrophone = function(enable = true) {
    const stream = this.client.getStreamForUser(game.user.id);
	const mode = this.settings.voiceMode;
    if ( ["always", "activity"].includes(mode) ) {		
		this.enableStreamAudio(stream, enable);
	}
    this.settings.users[game.user.id].muted = !enable;
  };

  WebRTC.prototype.enableCamera = function(enable = true) {
    let streamInfos = this.client.getConnectedStreams();
    let stream = this.client.getStreamForUser(game.user.id);
    
    this.enableStreamVideo(stream, enable);
  };

  WebRTC.prototype.broadcastMicrophone = function(broadcast) {
  };

  WebRTC.prototype._pttBroadcast = function(stream, broadcast) {
	  
    ui.webrtc.setUserIsSpeaking(game.user.id, broadcast);
	this.enableStreamAudio(stream, !this.settings.users[game.user.id].muted && broadcast);
  };

  WebRTC.prototype.onUserAudioStreamChange = function(userId, stream) {
	const userSettings = this.settings.users[userId];

	if (userSettings.canBroadcastAudio) {
		
		if (this.streamHasAudio(stream)) {
		  const audioLevelHandler = this._onAudioLevel.bind(this, userId);
		  game.audio.startLevelReports(userId, stream, audioLevelHandler, CONFIG.WebRTC.emitVolumeInterval);
		}
		else game.audio.stopLevelReports(userId);
		this._resetSpeakingHistory(userId);

		if (userSettings.muted) this.disableStreamAudio(stream);		
		
	}
	game.webrtc.client.uiUpdateNeeded();
  }
  
  WebRTC.prototype.onUserVideoStreamChange = function(userId, stream) {
    const userSettings = this.settings.users[userId];
    if (userSettings.canBroadcastVideo) {
		if (userSettings.hidden) this.disableStreamVideo(stream);
	}
	game.webrtc.client.uiUpdateNeeded();
  }
  
}); 

Hooks.on("ready", function() {
	

	game.webrtc = new JitsiWebRTC(new WebRTCSettings());	
	
	let roomid = game.webrtc.settings.getWorldSetting("server.room");
    if ( roomid == "" ) {
	  roomid = "fvtt" + (10000000 + Math.floor((Math.random() * 10000000) + 1));
	  game.webrtc.settings.setWorldSetting("server.room",roomid);
	}
	Hooks.callAll("webrtcSetVideoFilter");

	game.webrtc.initialize();
	
}); 
    
