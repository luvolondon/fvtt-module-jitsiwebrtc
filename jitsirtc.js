//const MODEL_URL = 'modules/jitsirtc/models'



let jitsirtc = null;
			
class JitsiWebRTC extends WebRTC {
	constructor(settings) {
		super(settings);
	this._faceOverlay = false;

  }

  setFaceOverlay(enable) {
	this._faceOverlay = enable;
  }

  async initialize() {
    await this.client.initialize();
	
	return this.connect(this);
  }
}

const JITSI_SET_INTERVAL = 1;
const JITSI_CLEAR_INTERVAL = 2;
const JITSI_INTERVAL_TIMEOUT = 3;

const code = `
    var timer;
    onmessage = function(request) {
        switch (request.data.id) {
        case ${JITSI_SET_INTERVAL}: {
            timer = setInterval(() => {
                postMessage({ id: ${JITSI_INTERVAL_TIMEOUT} });
            }, request.data.timeMs);
            break;
        }
        case ${JITSI_CLEAR_INTERVAL}: {
            if (timer) {
                clearInterval(timer);
            }
            break;
        }
        }
    };
`;
const timerWorkerScript = URL.createObjectURL(new Blob([ code ], { type: 'application/javascript' }));

let overlaycanvas = $('<canvas/>',
{id:"camcanvas",width: 300, height:200,style:'position:absolute;top:0;width:100%;height:100%'});

class OverlayEffect {

	constructor(bpModel) {
		
		this._outputCanvasElement = $('#camcanvas')[0];	
			
        this._outputCanvasContext = this._outputCanvasElement.getContext('2d');
        this._inputVideoElement = document.createElement('video');
		this._overlayTimerWorker = new Worker(timerWorkerScript);
		this._overlayTimerWorker.onmessage = this._onOverlayTimer.bind(this);
		this._overlayInProgress = false;
		this._bpModel = bpModel;
		this._overlay = {};
		this._overlay.img = new Image();
		this._overlay.img.src = 'modules/jitsirtc/sw.png';

		this._lasteyex = null;
		this._lasteyey = null;
		this._lasteyedist = null;

		this._segmentationData = null;
	}

	async _onOverlayTimer(response) {
        if (response.data.id === JITSI_INTERVAL_TIMEOUT) {
            if (!this._overlayInProgress) {
                await this._renderOverlay();
            }
        }
	}
	
	
    async _renderOverlay() {
		this._overlayInProgress = true;
				
        this._segmentationData = await this._bpModel.segmentPerson(this._inputVideoElement, {
            internalResolution: 'medium', // resized to 0.5 times of the original resolution before inference
            maxDetections: 1, // max. number of person poses to detect per image
            segmentationThreshold: 0.7 // represents probability that a pixel belongs to a person
		});

		this._overlayInProgress = false;

		if (this._segmentationData.allPoses[0]) {
			const leftEye = this._segmentationData.allPoses[0].keypoints[1].position;
			const rightEye = this._segmentationData.allPoses[0].keypoints[2].position;
			const leftEar = this._segmentationData.allPoses[0].keypoints[3].position;
			const rightEar = this._segmentationData.allPoses[0].keypoints[4].position;
			const nose = this._segmentationData.allPoses[0].keypoints[0].position;
			//const rightShoulder = this._segmentationData.allPoses[0].keypoints[6].position;
			let eyex = (leftEye.x + rightEye.x) / 2;			
			let eyey = (leftEye.y + rightEye.y) / 2;
			
			let eyedist = leftEye.x - rightEye.x;
			
			if (Math.abs(this._lasteyex - eyex) < 8) eyex = this._lasteyex;
			if (Math.abs(this._lasteyey - eyey) < 8) eyey = this._lasteyey;
			if (Math.abs(this._lasteyedist - eyedist) < 8) eyedist = this._lasteyedist;
			 
			const width = eyedist * 5; 
			this._lasteyex = eyey;
			this._lasteyey = eyey;
			this._lasteyedist = eyedist;
												
			this._outputCanvasContext.drawImage(this._inputVideoElement, 0, 0); 								
			if (this._overlay.img ) {										
				this._outputCanvasContext.drawImage(this._overlay.img, 
					eyex - width  / 2, eyey - width * 0.52, width,width);
			}
		}
	}
	
	isEnabled(jitsiLocalTrack) {
        return jitsiLocalTrack.isVideoTrack() && jitsiLocalTrack.videoType === 'camera';
	}
	
	startEffect(stream) {
        const firstVideoTrack = stream.getVideoTracks()[0];
        const { height, frameRate, width }
            = firstVideoTrack.getSettings ? firstVideoTrack.getSettings() : firstVideoTrack.getConstraints();

        this._outputCanvasElement.width = parseInt(width, 10);
        this._outputCanvasElement.height = parseInt(height, 10);
        this._inputVideoElement.width = parseInt(width, 10);
        this._inputVideoElement.height = parseInt(height, 10);
        this._inputVideoElement.autoplay = true;
        this._inputVideoElement.srcObject = stream;
        this._inputVideoElement.onloadeddata = () => {
            this._overlayTimerWorker.postMessage({
                id: JITSI_SET_INTERVAL,
                timeMs: 1000 / parseInt(frameRate / 5.0, 10)
            });
        };

        return this._outputCanvasElement.captureStream(parseInt(frameRate / 5.0, 10));
	}
	
	stopEffect() {
        this._overlayTimerWorker.postMessage({
            id: JITSI_CLEAR_INTERVAL
        });
    }
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
    
    this._usernameCache = {};
	this._idCache = {};
	this._withAudio = false;
	this._withVideo = false;
  }

  getLocalTracks() {
	if (this._roomhandle) 
		 return this._roomhandle.getLocalTracks();
	return [];
  }

    async initialize() {
		
		const mode = this._settings["worldSettings"]["mode"];
		this._withAudio = ( (mode == 1) || (mode == 3));
		this._withVideo = ( (mode == 2) || (mode == 3));

		console.warn("Init:" + this._withAudio + ":" + this._withVideo);
		if (game.webrtc.client._withAudio || game.webrtc.client._withVideo) {	
			JitsiMeetJS.init(game.webrtc.client._options);	
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
		
		console.warn("Jitsi: track type " + track.getType() + " added " + participant );
		if (client._remoteTracks[participant] == null) 
			client._remoteTracks[participant] = [];
		
		client._remoteTracks[participant].push(track);
		const userId = client._idCache[participant];
					
		if (userId != null) { 
				console.warn("Jitsi: onUserStreamChange " + userId );				
				
				if (track.getType() === "video") {
					game.webrtc.onUserVideoStreamChange( userId,client.getRemoteStreamForId(participant));
				}
				if (track.getType() === "audio") {
					game.webrtc.onUserAudioStreamChange( userId,client.getRemoteStreamForId(participant));
				}
		
		} else {
			console.error("JITSI: track of unknown user " + participant);
		}
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
		console.warn("Jitsi: track type " + track.getType() + " removed " + participant  );
		
		if (client._remoteTracks[participant] != null) {		

			client._remoteTracks[participant] = client._remoteTracks[participant].filter(function(value, index, arr){ 
				return value.ssrc != track.ssrc;});
			
			const userId = client._idCache[participant];
			
			if (userId != null) { 
					
					if (track.getType() === "video") {
						game.webrtc.onUserVideoStreamChange( userId,client.getRemoteStreamForId(participant));
					}
					if (track.getType() === "audio") {
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

	_onLocalTracks(resolve,tracks) {
		
		for (let i = 0; i <  tracks.length; i++) {
			const track = tracks[i];
	
			track.enabled = true;
			track.track.enabled = true;
			game.webrtc.client._roomhandle.addTrack(track);	

			console.warn("Jitsi: local track added " + track.getType());						

			if (  (track.getType() === "audio") && 
				(  (game.webrtc.settings.voiceMode === "ptt") || this.settings.users[game.user.id].muted)) {				
				game.webrtc.disableStreamAudio(this.getStreamForUser(game.userId));
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
		if (stream != null) {
	console.warn("assignStreamToVideo");
	console.warn(stream.getTracks());
	
			try {
				video.srcObject = stream;
			} catch (error) {
				video.src = window.URL.createObjectURL(stream);
			}

			if (game.webrtc._faceOverlay && $(video).hasClass("local-camera")) {

				$(video).parent().append( overlaycanvas );
			}	  

		}
   }
  
	/**
	 *
	 * @param id
	 */
	 _onUserLeft(id) {
	
		 console.log("Jitsi: User left:" + game.webrtc.client._idCache[id]);
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
		this._roomhandle.setDisplayName(game.userId);

		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_ADDED, this._onRemoteTrack);
		this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_REMOVED, this._onRemoteTrackRemove);
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
		
		
		this._roomhandle.join();
  }
	
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
		
		let bpModel = null;
		let thiseffects = [];

		if (game.webrtc._faceOverlay) {
			bpModel = await bodyPix.load({
				architecture: 'MobileNetV1',
				outputStride: 16,
				multiplier: 0.50,
				quantBytes: 2
			});
			thiseffects = [
				new OverlayEffect(bpModel)
			];
		}

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
console.warn("Audio Track dispose");					
					track.dispose();					
						
				}
			}
			if ( track.getType() === "video") {
				videoFound = true;
				if (!withVideo) {
console.warn("Video Track dispose");					
					track.dispose();
				}
			}
		}
		
		let devlist = [];
		if ( withAudio && !audioFound) devlist.push( 'audio' );
		if ( withVideo && !videoFound) devlist.push( 'video' );
		console.warn(devlist);

		if (devlist.length > 0) {
			

			JitsiMeetJS.createLocalTracks({ devices: devlist,resolution: 240,
				disableSimulcast: false,				
				cameraDeviceId : videoSrc,
				micDeviceId : audioSrc,
				effects : thiseffects,
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
			.then(this._onLocalTracks.bind(this,resolve))
			.catch(error => {
				throw error;
			});
		} else {
			
			resolve(this.getStreamForUser(game.userId));
		}
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

/* TODO
	*/
  }
  
}

Hooks.on("init", function() {
  
  CONFIG["WebRTC"].clientClass = JitsiRTCClient;
  JitsiRTCClient._isBusy = false;

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
    // Enable/Disable the master stream so it affects new users joining in
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
	

	if (!userSettings.canBroadcastAudio) {
		
		// Start/stop listening to stream audio levels depending on whether the stream (streamHasAudio is null safe) has audio tracks or not
		if (this.streamHasAudio(stream)) {
		  const audioLevelHandler = this._onAudioLevel.bind(this, userId);
		  game.audio.startLevelReports(userId, stream, audioLevelHandler, CONFIG.WebRTC.emitVolumeInterval);
		}
		else game.audio.stopLevelReports(userId);
		this._resetSpeakingHistory(userId);

		// Disable stream components if muted or hidden
		if (userSettings.muted) this.disableStreamAudio(stream);
		
		
	}
	game.webrtc.client.uiUpdateNeeded();
  }
  
  WebRTC.prototype.onUserVideoStreamChange = function(userId, stream) {
    const userSettings = this.settings.users[userId];
    if (userSettings.canBroadcastVideo) {
		this.setVideoStream(userId, stream);

		// Disable stream components if muted or hidden
		if (userSettings.hidden) this.disableStreamVideo(stream);
	}
	game.webrtc.client.uiUpdateNeeded();
  }
  
});

Hooks.on("ready", function() {
	
	game.settings.register("jitsirtc", "faceOverlay", {
		name: "Demo face overlay",
		hint: "Activate the face overlay effect (demo modus)",
		scope: "world",
		config: true,
		default: false,
    	type: Boolean,
		onChange: enable => game.webrtc.setFaceOverlay(enable)
	});	

	game.webrtc = new JitsiWebRTC(new WebRTCSettings());	
	
	let roomid = game.webrtc.settings.getWorldSetting("server.room");
    if ( roomid == "" ) {
	  roomid = "fvtt" + (10000000 + Math.floor((Math.random() * 10000000) + 1));
	  game.webrtc.settings.setWorldSetting("server.room",roomid);
	}
	game.webrtc.setFaceOverlay(game.settings.get("jitsirtc", "faceOverlay"));
	game.webrtc.initialize();
	
}); 
    