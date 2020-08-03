let jitsirtc = null;

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
    this._streams = {};
    this._videofilter = null;

    this._settings = settings;

    const { server } = this._settings.worldSettings;
    this._room = this._settings.worldSettings.server.room;

    if (server.type === 'FVTT') {
      this._options = {
        hosts: {
          domain: 'beta.meet.jit.si',
          muc: 'conference.beta.meet.jit.si',
        },
        bosh: '//beta.meet.jit.si/http-bind',
        clientNode: 'http://beta.meet.jit.si',
      };
      this._auth = {};
    } else {
      let mucUrl = `conference.${server.url}`;
      let focusUrl = `focus.${server.url}`;
      let boshUrl = `//${server.url}/http-bind`;

      if (game.settings.get('jitsirtc', 'customUrls')) {
        mucUrl = game.settings.get('jitsirtc', 'mucUrl');
        focusUrl = game.settings.get('jitsirtc', 'focusUrl');
        boshUrl = game.settings.get('jitsirtc', 'boshUrl');
      }

      this._options = {
        hosts: {
          domain: server.url,
          muc: mucUrl,
          focus: focusUrl,
        },
        bosh: boshUrl,
        clientNode: 'http://jitsi.org/jitsimeet',
      };
      this._auth = {
        id: server.username,
        password: server.password,
      };
    }

    this._usernameCache = {};
    this._idCache = {};
    this._externalUserCache = {};
    this._withAudio = false;
    this._withVideo = false;
  }

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.log
   */
  debug(...args) {
    if (this.settings.debugClient) console.log('JitsiRTC | ', ...args);
  }

  getLocalTracks() {
    if (this._roomhandle) return this._roomhandle.getLocalTracks();
    return [];
  }

  getFilterCanvas() {
    if (this._videofilter) return this._videofilter.getFilterCanvas();
    return null;
  }

  hasActiveFilter() {
    if (this._videofilter) return this._videofilter.hasActiveFilter();

    return false;
  }

  setVideoFilter(filter) {
    this._videofilter = filter;
  }

  async getVideoFilter() {
    if (this._videofilter) return this._videofilter.getVideoFilter();

    return [];
  }

  async initialize() {
    const { mode } = this._settings.worldSettings;
    this._withAudio = ((mode === 1) || (mode === 3));
    this._withVideo = ((mode === 2) || (mode === 3));

    this.debug('initialize withAudio: ', this._withAudio, ' withVideo: ', this._withVideo);

    if (game.webrtc.client._withAudio || game.webrtc.client._withVideo) {
      JitsiMeetJS.init(game.webrtc.client._options);
      JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
      this.debug('JitsiMeetJS init with options ', game.webrtc.client._options);
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
  async connect() {
    return new Promise((resolve) => {
      jitsirtc = new JitsiMeetJS.JitsiConnection(null, null, this._options);

      this.debug('Connection created with options ', this._options);

      jitsirtc.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        this._loginSuccess.bind(this, resolve),
      );
      jitsirtc.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        this._loginFailure.bind(this, resolve),
      );
      jitsirtc.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        this._onDisconnect.bind(this, resolve),
      );

      jitsirtc.connect(this._auth);

      this.debug('Async call to connect started.');
    });
  }

  uiUpdateNeeded() {
    if (ui.webrtc && (ui.webrtc._state === 1)) {
      setTimeout(() => {
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
    const { client } = game.webrtc;

    client.debug('remote track type ', track.getType(), ' from participant ', participant, ' added.');

    if (client._remoteTracks[participant] == null) client._remoteTracks[participant] = [];

    client._remoteTracks[participant].push(track);
    const userId = client._idCache[participant];

    if (userId != null) {
      const stream = client.getStreamForUser(userId);
      stream.addTrack(track.track);
      game.webrtc.onUserStreamChange(userId, client.getStreamForUser(userId));
    } else {
      client.debug('Remote track of unknown participant ', participant, ' added.');
    }
    client.debug('remote track add finished, type: ', track.getType(), ' participant: ', participant);
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
    const { client } = game.webrtc;
    client.debug('remote track type ', track.getType(), ' removed for participant ', participant);

    if (client._remoteTracks[participant] != null) {
      client._remoteTracks[participant] = client._remoteTracks[participant].filter(
        (value) => value.ssrc !== track.ssrc,
      );

      const userId = client._idCache[participant];
      const stream = client.getStreamForUser(userId);
      stream.removeTrack(track.track);

      if (userId != null) {
        game.webrtc.onUserStreamChange(userId, client.getStreamForUser(userId));
      }
    }
  }

  getStreamForUser(userId) {
    const stream = this._streams[userId];
    return stream;
  }

  async _onLocalTracks(resolve, tracks) {
    const addedTracks = [];
    const stream = new MediaStream();
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];

      track.enabled = true;
      track.track.enabled = true;
      addedTracks.push(game.webrtc.client._roomhandle.addTrack(track).then(() => {
        this.debug('local track ', track, ' added.');
        stream.addTrack(track.track);

        if (track.getType() === 'audio') {
          game.webrtc.enableStreamAudio(
            stream,
            !this.settings.users[game.user.id].muted,
          );
        } else if (track.getType() === 'video') {
          game.webrtc.enableStreamVideo(
            stream,
            !this.settings.users[game.user.id].hidden,
          );
        }
      }));
    }

    // Wait for all tracks to be added
    await Promise.all(addedTracks);
    this._streams[game.userId] = stream;
    resolve(this.getStreamForUser(game.userId));
  }

  setAudioOutput() {
    this.debug('setAudioOutput not implemented');
  }

  assignStreamToVideo(stream, video) {
    this.debug('assignStreamToVideo stream:', stream, ' video:', video);

    const streamVideo = video;

    if (stream) {
      try {
        streamVideo.srcObject = stream;
      } catch (error) {
        streamVideo.src = window.URL.createObjectURL(stream);
      }

      if (game.webrtc.client.hasActiveFilter() && $(video).hasClass('local-camera')) {
        $(video).parent().append(game.webrtc.client.getFilterCanvas());
      }
    }
  }

  _onUserLeft(id) {
    this.debug('user left: ', game.webrtc.client._idCache[id]);

    game.webrtc.onUserStreamChange(game.webrtc.client._idCache[id], null);

    delete game.webrtc.client._remoteTracks[id];
    delete game.webrtc.client._usernameCache[game.webrtc.client._idCache[id]];
    delete game.webrtc.client._streams[game.webrtc.client._idCache[id]];
    delete game.webrtc.client._idCache[id];

    // Remove the temporary user entity if they are an external Jitsi user
    if (game.webrtc.client._externalUserCache[id]) {
      delete game.webrtc.client._externalUserCache[id];
      game.users.delete(id);
    }

    this.uiUpdateNeeded();
  }

  /* -------------------------------------------- */

  /**
   * Connection success callback
   * @private
   */
  _loginSuccess(resolve) {
    this._roomhandle = jitsirtc.initJitsiConference(this._room, {
      openBridgeChannel: true,
      startSilent: false,
      p2p: {
        enabled: false,
      },
    });
    this.debug('conference joined: ', this._roomhandle);
    this._roomhandle.setDisplayName(game.userId);

    this._roomhandle.on(JitsiMeetJS.events.conference.CONFERENCE_ERROR, this._onConferenceError);
    this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_ADDED, this._onRemoteTrack);
    this._roomhandle.on(JitsiMeetJS.events.conference.TRACK_REMOVED, this._onRemoteTrackRemove);
    this._roomhandle.on(
      JitsiMeetJS.events.conference.CONFERENCE_JOINED,
      this._onConferenceJoined.bind(this, resolve),
    );

    this._roomhandle.on(JitsiMeetJS.events.conference.USER_JOINED, (id, participant) => {
      let displayName = participant._displayName;

      // Handle Jitsi users who join the meeting directly
      if (!game.users.entities.find((u) => u.id === displayName)) {
        // Save the Jitsi display name into an external users cache
        game.webrtc.client._externalUserCache[id] = displayName || 'Jitsi User';

        // Set the stored user name equal to the Jitsi ID
        displayName = id;

        // Add the external user as a temporary user entity
        if (game.settings.get('jitsirtc', 'allowExternalUsers')) {
          this._addExternalUserData(id);
        }
      }

      game.webrtc.client._usernameCache[displayName] = id;
      game.webrtc.client._idCache[id] = displayName;
      game.webrtc.client._remoteTracks[id] = [];
      game.webrtc.client._streams[displayName] = new MediaStream();
      this.debug('user joined: ', displayName);
    });

    this._roomhandle.on(JitsiMeetJS.events.conference.USER_LEFT, this._onUserLeft.bind(this));

    this._roomhandle.join();
  }

  _addExternalUserData(id) {
    this.debug('Adding external Jitsi user: ', id);

    // Create user data for the external user
    const data = {
      _id: id,
      active: true,
      password: '',
      role: CONST.USER_ROLES.NONE,
      permissions: {
        BROADCAST_AUDIO: true,
        BROADCAST_VIDEO: true,
      },
      avatar: CONST.DEFAULT_TOKEN,
      character: '',
      color: '#ffffff',
      flags: {},
      name: game.webrtc.client._externalUserCache[id],
    };

    // Add the external user as a tempoary user entity
    const externalUser = new User(data);
    game.users.insert(externalUser);
  }

  _onConferenceJoined(resolve) {
    this.debug('conference joined event.');
    resolve(true);
  }

  _onConferenceError(errorCode) {
    this.debug('Conference error: ', errorCode);
    this.webrtc.onError(errorCode);
  }

  /**
   * Get the list of connected streams
   * The result would be an array of objects in the form of {id, pc, local, remote}
   * where id is the user's ID, pc is the RTCPeerConnection object associated to the peer,
   * local is the local stream added to the call and remote is the remote user's stream
   *
   * @return {Array.Object}
   */
  getConnectedStreams() {
    const localStream = game.webrtc.client.getStreamForUser(game.userId);
    const connectedStreams = [];

    Object.keys(game.webrtc.client._usernameCache).forEach((userName) => {
      if (userName !== game.userId) {
        connectedStreams.push({
          id: userName,
          pc: null, // Does not exist for Jitsi
          local: localStream,
          remote: game.webrtc.client.getStreamForUser(userName),
        });
      }
    });
    return connectedStreams;
  }

  /* -------------------------------------------- */

  /**
   * Connection failure callback
   * @private
   */
  _loginFailure(resolve, errorCode, message) {
    this.debug('Login ERROR ', errorCode, message);
    this.webrtc.onError(message);
    resolve(false);
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
      return new Promise((resolve) => {
        jitsirtc.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
          this._loginSuccess.bind(this, resolve),
        );
        jitsirtc.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_FAILED,
          this._loginFailure.bind(this, resolve),
        );
        jitsirtc.removeEventListener(
          JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
          this._onDisconnect.bind(this),
        );

        jitsirtc.disconnect();
      });
    }

    return null;
  }

  async initLocalStream(audioSrc, videoSrc) {
    const videoEffects = await game.webrtc.client.getVideoFilter();
    return new Promise((resolve) => {
      const withAudio = this._withAudio && audioSrc;
      const withVideo = this._withVideo && videoSrc;
      const localtracks = game.webrtc.client.getLocalTracks();

      let audioFound = false;
      let videoFound = false;

      for (let i = 0; i < localtracks.length; i += 1) {
        const track = localtracks[i];
        if (track.getType() === 'audio') {
          audioFound = true;
          if (!withAudio) {
            this.debug('Audio track dispose');
            track.dispose();
          }
        }
        if (track.getType() === 'video') {
          videoFound = true;
          if (!withVideo) {
            this.debug('Video track dispose');
            track.dispose();
          }
        }
      }

      const devlist = [];
      if (withAudio && !audioFound) devlist.push('audio');
      if (withVideo && !videoFound) devlist.push('video');
      this.debug('Device list for createLocalTracks: ', devlist);

      if (devlist.length > 0) {
        JitsiMeetJS.createLocalTracks({
          devices: devlist,
          resolution: 240,
          disableSimulcast: false,
          cameraDeviceId: videoSrc,
          micDeviceId: audioSrc,
          effects: videoEffects,
          constraints: {
            video: {
              aspectRatio: 4 / 3,
              height: {
                ideal: 240,
                max: 480,
                min: 120,
              },
              width: {
                ideal: 320,
                max: 640,
                min: 160,
              },

            },
          },
        })
          .then(this._onLocalTracks.bind(this, resolve))
          .catch((error) => {
            throw error;
          });
      } else {
        resolve(this.getStreamForUser(game.userId));
      }
    });
  }


  async closeLocalStream() {
    this.debug('closeLocalStream not implemented');
  }

  /* -------------------------------------------- */
  /*  Device Discovery                            */
  /* -------------------------------------------- */

  /**
   * Get the list of available video sources.
   * The expected result is an object with the device id as key and its human-readable label as
   * value.
   * @return {Promise.Object}
   */
  async getVideoSources() {
    return new Promise((resolve) => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices((list) => {
          resolve(this._deviceInfoToObject(list, 'videoinput'));
        });
      } catch (err) {
        resolve({});
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the list of available audio sources.
   * The expected result is an object with the device id as key and its human-readable label as
   * value.
   * @return {Promise.Object}
   */
  async getAudioSources() {
    return new Promise((resolve) => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices((list) => resolve(this._deviceInfoToObject(list, 'audioinput')));
      } catch (err) {
        resolve({});
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Get the list of available audio output devices
   * The expected result is an object with the device id as key and its human-readable label as
   * value
   *
   * Note: This feature is not supported by Firefox by default as it depends on the enumerateDevices
   * API which doesn't list output devices on Firefox 63+ unless the media.setsinkid.enabled
   * settings is enabled.
   * See https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices
   *
   * @return {Promise.Object}
   */
  async getAudioSinks() {
    return new Promise((resolve) => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices((list) => resolve(this._deviceInfoToObject(list, 'audiooutput')));
      } catch (err) {
        resolve({});
      }
    });
  }

  /**
   * Transform the device info array from jitsirtc into an object with {id: label} keys
   * @param {Array} list    The list of devices
   * @private
   */
  _deviceInfoToObject(list, kind) {
    const obj = {};
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].kind === kind) {
        obj[list[i].deviceId] = list[i].label || game.i18n.localize('WEBRTC.UnknownDevice');
      }
    }

    return obj;
  }


  /* -------------------------------------------- */

  /**
   * Generic error callback.
   * Filter out bad ice candidate errors since they can happen often for various reasons and
   * reporting them can only serve to confuse players.
   * @private
   */
  _onError({
    errorCode,
    errorText,
  }) {
    this.debug('Error : ', { errorCode, errorText });

    game.webrtc.onError(errorText);
  }

  /* -------------------------------------------- */

  /**
   * Called when the connection to the signaling server is lost
   * @private
   */
  _onDisconnect(...args) {
    this.debug('Disconnected', args);
    game.webrtc.onDisconnect();
  }


  /* -------------------------------------------- */

  /**
   * Notify of settings changes
   * This can be used to act according
   * @param {Object} changed     Object consisting of the changed settings in the form {key: value}
   */
  onSettingsChanged() {

    /* TODO
     */
  }

  _useCustomUrls(value) {
    if (value) {
      // Initially set to defaults
      const { server } = this._settings.worldSettings;
      game.settings.set('jitsirtc', 'mucUrl', `conference.${server.url}`);
      game.settings.set('jitsirtc', 'focusUrl', `focus.${server.url}`);
      game.settings.set('jitsirtc', 'boshUrl', `//${server.url}/http-bind`);
    } else {
      // Clear values
      game.settings.set('jitsirtc', 'mucUrl', '');
      game.settings.set('jitsirtc', 'focusUrl', '');
      game.settings.set('jitsirtc', 'boshUrl', '');
    }

    window.location.reload();
  }
}

Hooks.on('init', () => {
  CONFIG.WebRTC.clientClass = JitsiRTCClient;

  game.settings.register('jitsirtc', 'allowExternalUsers', {
    name: 'Allow standalone Jitsi users',
    hint: 'If a user joins the Jitsi meeting outside of FVTT, show them to players in the FVTT interface',
    scope: 'world',
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });
  game.settings.register('jitsirtc', 'customUrls', {
    name: 'Use custom Jitsi URLs',
    hint: 'Enable to allow custom MUC, Focus, or Bosh URLs. (Settings will be available here after enabling this option).',
    scope: 'world',
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => game.webrtc.client._useCustomUrls(value),
  });
  game.settings.register('jitsirtc', 'mucUrl', {
    name: 'Jitsi MUC URL',
    hint: 'config["hosts"]["muc"] in jitsi-meet config.js',
    default: '',
    scope: 'world',
    type: String,
    config: game.settings.get('jitsirtc', 'customUrls'),
    onChange: () => window.location.reload(),
  });
  game.settings.register('jitsirtc', 'focusUrl', {
    name: 'Jitsi Focus URL',
    hint: 'config["hosts"]["focus"] in jitsi-meet config.js',
    default: '',
    scope: 'world',
    type: String,
    config: game.settings.get('jitsirtc', 'customUrls'),
    onChange: () => window.location.reload(),
  });
  game.settings.register('jitsirtc', 'boshUrl', {
    name: 'Jitsi Bosh URL',
    hint: 'config["bosh"] in jitsi-meet config.js',
    default: '',
    scope: 'world',
    type: String,
    config: game.settings.get('jitsirtc', 'customUrls'),
    onChange: () => window.location.reload(),
  });
  game.settings.register('jitsirtc', 'debug', {
    name: 'Enable debug logging',
    hint: 'Enables CONFIG.debug.av and CONFIG.debug.avclient for extra logging',
    scope: 'world',
    config: false,
    default: false,
    type: Boolean,
    onChange: (value) => {
      CONFIG.debug.av = value;
      CONFIG.debug.avclient = value;
    },
  });

  // Enable debug logging if hidden debug setting is true
  if (game.settings.get('jitsirtc', 'debug')) {
    CONFIG.debug.av = true;
    CONFIG.debug.avclient = true;
  }
});

Hooks.on('setup', () => {
  /**
   * Checks if a stream has any audio tracks enabled
   * @param {MediaStream} stream    The stream to check
   * @return {Boolean}
   */
  WebRTC.prototype.isStreamAudioEnabled = function isStreamAudioEnabled(stream) {
    if (stream === this.client.getStreamForUser(game.user.id)) {
      return !this.settings.users[game.user.id].muted;
    }

    const tracks = stream ? stream.getAudioTracks() : [];
    return tracks.some((t) => t.enabled);
  };
});

Hooks.on('ready', () => {
  let roomid = game.webrtc.settings.getWorldSetting('server.room');
  if (roomid === '') {
    roomid = `fvtt${10000000 + Math.floor((Math.random() * 10000000) + 1)}`;
    game.webrtc.settings.setWorldSetting('server.room', roomid);
  }
});
