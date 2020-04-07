
let jitsirtc = null;

class JitsiMediaStream extends MediaStream {
	constructor() {
		super();
		this.tracks = [];	
		this.jitsitracks = [];			
	}
	/*
	getAudioTracks() {		
		return this.jitsitracks.filter(t => t.getType() === 'audio') ;
	}
	getVideoTracks() {
		return this.jitsitracks.filter(t => t.getType() === 'video') ;
	}
	*/
}

/**
 * WebRTC Client using the JitsiRTC framework for its implementation.
 * Whenever a new remote stream is received by this implementation, a call to `this.webrtc.onUserStreamChange()`
 * will be made to notify of the new or deleted stream.
 *
 * @implements {WebRTCInterface}
 * @param {WebRTC} webrtc             The WebRTC object
 * @param {WebRTCSettings} settings   The WebRTC Settings object
 */
class JitsiRTCClient extends WebRTCInterface {
  constructor(webrtc, settings) {
    super(webrtc, settings);

    /**
     * Cached copy of the room joined
     * @type {String}
     * @private
     */
    
	this._roomhandle = null;
	this._connected = false;
	
	this._localStream = null;
	this._remoteStreams =  {};
	
	this._remoteTracks = {};
	
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
    /**
     * A cached mapping of jitsiRtcId participant ids to FVTT user ids
     * @type {Object}
     * @private
     */
    this._usernameCache = {};
	this._idCache = {};

  }

  /* -------------------------------------------- */

  /**
   * Initialize the WebRTC implementation.
   * This will only be called once by the main setupGame() initialization function.
   * @return {Promise.boolean}
   */
  async initialize() {
	const mode = this._settings["worldSettings"]["mode"];
	
	if (mode > 0) {	
		JitsiMeetJS.init(this._options);	
		JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
		game.webrtc.debug("JitsiMeetJS init");
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
    
    });
  }
  
	/**
	 * Handles incoming remote tracks
	 * @param track JitsiTrack object
	 */
	 _onRemoteTrack(track) {
		
		if (track.isLocal()) {
			return;
		}
		
		const participant = track.getParticipantId();
		const client = game.webrtc.client;
		
		if (client._remoteTracks[participant] == null) 
			client._remoteTracks[participant] = [];
		
		client._remoteTracks[participant].push(track);
		const userId = client._idCache[participant];
		
		if (userId != null) { 
			game.webrtc.onUserStreamChange( userId,client.getRemoteStreamForId(participant));
		}
		/*
		track.addEventListener(
			JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
			audioLevel => console.log(`Audio Level remote: ${audioLevel}`));
		track.addEventListener(
			JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
			() => console.log('remote track muted'));
			*/
		track.addEventListener(
			JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
			() => console.log('Jitsi: remote track stoped'));
		/*
		track.addEventListener(
			JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
			deviceId =>
				console.log(
					`track audio output device was changed to ${deviceId}`));
				*/
	}
	
	getRemoteStreamForId(id) {
		let stream = new JitsiMediaStream();
		
		if (game.webrtc.client._remoteTracks[id] != null) {
			stream.jitsitracks = game.webrtc.client._remoteTracks[id];
			
			for (let i = 0; i <  stream.jitsitracks.length; i++) {		
				
				stream.tracks.push(stream.jitsitracks[i].track);			
			//	stream.jitsitracks.push(stream.jitsitracks[i]);			
				stream.addTrack(stream.jitsitracks[i].track);
				game.webrtc.enableStreamVideo(stream);
			}
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
		if (userId == game.userId) { 
		  return game.webrtc.client._localStream;
		}
		return game.webrtc.client.getRemoteStreamForUserId(userId);
   }

	_onLocalTracks(resolve,tracks) {
		
		game.webrtc.client._localStream = new JitsiMediaStream();
		
		for (let i = 0; i <  tracks.length; i++) {
			const track = tracks[i];
			/*
			track.addEventListener(
				JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
				audioLevel => console.log(`Audio Level local: ${audioLevel}`));
			*/
			track.addEventListener(
				JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
				() => console.log('Jitsi: local track muted'));
			track.addEventListener(
				JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
				() => console.log('Jitsi: local track stoped'));
			/*
			track.addEventListener(
				JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
				deviceId =>
					console.log(
						`Jitsi: track audio output device was changed to ${deviceId}`));
			*/
			track.enabled = true;
			track.track.enabled = true;
			game.webrtc.client._localStream.tracks.push( track.track);	
			game.webrtc.client._localStream.jitsitracks.push( track);	
			game.webrtc.client._localStream.addTrack(track.track);			
			game.webrtc.client._roomhandle.addTrack(track);	
		}
		resolve(game.webrtc.client._localStream);
   } 
   
     
  setAudioOutput(video, audioSinkId) {
  //  easyrtc.setAudioOutput(video, audioSinkId);
  }

    assignStreamToVideo(stream, video) {
		if (stream != null) {
			
			const videotracks = stream.jitsitracks.filter(t => t.getType() === 'video');	
			if (videotracks[0])
				videotracks[0].attach(video);

		}
   }
  
	/**
	 *
	 * @param id
	 */
	 _onUserLeft(id) {
		 console.log("Jitsi: User left:" + game.webrtc.client._idCache[id]);
		 game.webrtc.client._remoteTracks[ id ] = null;
		 game.webrtc.client._remoteStreams[ id ] = null;
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
				openBridgeChannel: true
		});
		this._roomhandle.setDisplayName(game.userId);
		
		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_ADDED, this._onRemoteTrack);
		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_REMOVED, track => {
			console.log(`Jitsi: track removed!${track}`);
		});
		this._roomhandle.on(
			JitsiMeetJS.events.conference.CONFERENCE_JOINED,
			this._onConferenceJoined.bind(this, resolve));
				
		this._roomhandle.on(JitsiMeetJS.events.conference.USER_JOINED, (id, participant) => {
		
			game.webrtc.client._usernameCache[participant._displayName] = id;
			game.webrtc.client._idCache[id] = participant._displayName;
			game.webrtc.client._remoteTracks[id] = [];
			console.log(`Jitsi: user joined!${participant._displayName}`);
			
		});

		this._roomhandle.on(JitsiMeetJS.events.conference.USER_LEFT, this._onUserLeft.bind(this));
		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED, track => {
			console.log(`${track.getType()} - ${track.isMuted()}`);
		});
		this._roomhandle.on(
			JitsiMeetJS.events.conference.DISPLAY_NAME_CHANGED,
			(userID, displayName) => console.log(`${userID} - ${displayName}`));
			/*
		this._roomhandle.on(
			JitsiMeetJS.events.conference.TRACK_AUDIO_LEVEL_CHANGED,
			(userID, audioLevel) => console.log(`${userID} - ${audioLevel}`));
		*/
		this._roomhandle.join();
  }

	/**
	 * That function is executed when the conference is joined
	 */
	 _onConferenceJoined(resolve) {
		console.log('Jitsi: conference joined!');
		resolve(true);
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

    game.webrtc.debug("Login ERROR ", errorCode, message);
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
		
		JitsiMeetJS.createLocalTracks({ devices: [ 'audio', 'video' ],resolution: 240,
			disableSimulcast: true,
			p2p: { 
				enabled:false
			},
			cameraDeviceId : videoSrc,
			micDeviceId : audioSrc,
			constraints: {
					video: {
						aspectRatio: 4 /3,
						height: {
							ideal: 240,
							max: 360,
							min: 120
						},
						width: {
							ideal: 360,
							max: 480,
							min: 160
						}

					}
				},
		})
		.then(this._onLocalTracks.bind(this,resolve))
		.catch(error => {
			throw error;
		});

    });
  }

  /* -------------------------------------------- */

  /**
   * Closes a local media stream.
   * If the master stream is closed, any subsequent WebRTC calls will not have any streams sent to the peer.
   *
   * If @temporary is `false` (default), the master stream will be destroyed and all local streams removed from any
   * existing calls. If @temporary is `true`, closes the temporary stream
   *
   * @param {boolean} temporary     Whether to create a temporary stream or the master stream
   * @return {Promise}
   */
  async closeLocalStream(temporary=false) {
	  
    Hooks.callAll("rtcLocalStreamClosed", game.webrtc);
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
	console.warn(JSON.stringify(list) + ":" + kind)
	  
	const obj = {};
	for (let i = 0; i <  list.length; i++) {
		if ( (list[i].kind === kind) && (list[i].deviceId != "default")) {
			obj[list[i].deviceId] = list[i].label || game.i18n.localize("WEBRTC.UnknownDevice")
		}
	}
	console.warn(JSON.stringify(obj) + ":" + kind);
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
    game.webrtc.debug("jitsiRTC Error : ", ...arguments);
   
      this.webrtc.onError(errorText);
  }

  /* -------------------------------------------- */

  /**
   * Called when the connection to the signaling server is lost
   * @private
   */
  _onDisconnect() {
    game.webrtc.debug("jitsiRTC disconnected", ...arguments);
    this.webrtc.onDisconnect();
  }

 

  /* -------------------------------------------- */

  /**
   * Notify of settings changes
   * This can be used to act according
   * @param {Object} changed     Object consisting of the changed settings in the form {key: value}
   */
  onSettingsChanged(changed) {


    // Change the set of users
/*    const changedUsers = changed.users || {};
    for ( let [userId, user] of Object.entries(changedUsers) ) {
      if ( user.blocked === undefined ) continue;
      const easyRtcId = this._userIdToEasyRtcId(userId);
      if ( !easyRtcId ) continue;
      if ( user.blocked ) easyrtc.hangup(easyRtcId);
      else this._performCall(easyRtcId).catch(()=>{});
    }
	*/
  }
  
}

Hooks.on("init", function() {
  
  CONFIG["WebRTC"].clientClass = JitsiRTCClient;

});

Hooks.on("setup", function() {
   
});

Hooks.on("ready", function() {

});