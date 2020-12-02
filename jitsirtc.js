/**
 * An AVClient implementation that uses WebRTC and the Jitsi Meet API library.
 * @extends {AVClient}
 * @param {AVMaster} master           The master orchestration instance
 * @param {AVSettings} settings       The audio/video settings being used
 */
class JitsiRTCClient extends AVClient {
  constructor(master, settings) {
    super(master, settings);

    this._jitsiConnection = null;
    this._jitsiConference = null;
    this._server = null;
    this._room = null;
    this._streams = {};
    this._usernameCache = {};
    this._idCache = {};
    this._externalUserCache = {};
    this._loginSuccessHandler = null;
    this._loginFailureHandler = null;
    this._onDisconnectHandler = null;
    this._localAudioEnabled = false;
    this._localAudioBroadcastEnabled = false;
    this._localVideoEnabled = false;
    this._useJitsiMeet = false;

    this._render = debounce(this.master.render.bind(this), 2000);

    this.jitsiURL = null;
  }

  // Default Jitsi Meet address to use
  static defaultJitsiServer = "beta.meet.jit.si";

  /* -------------------------------------------- */
  /*  Connection                                  */
  /* -------------------------------------------- */

  /**
     * One-time initialization actions that should be performed for this client implementation.
     * This will be called only once when the Game object is first set-up.
     * @return {Promise<void>}
     */
  async initialize() {
    this.debug("JitsiRTCClient initialize");
    if (this.settings.get("world", "server").type === "custom") {
      this._server = this.settings.get("world", "server").url;
    } else {
      // TODO: set up server types for beta / defult jitsi servers instead of just the "FVTT" type
      this._server = JitsiRTCClient.defaultJitsiServer;
    }

    // Don't fully initialize if client has enabled the option to use the full Jitsi Meet client
    if (game.settings.get("jitsirtc", "useJitsiMeet")) {
      this.debug("useJitsiMeet set, not initializing JitsiRTC");
      this._useJitsiMeet = true;
      return true;
    }

    // Load lib-jitsi-meet and config values from the selected server
    await this._loadScript(`https://${this._server}/libs/lib-jitsi-meet.min.js`);
    await this._loadScript(`https://${this._server}/config.js`);

    // Set up default config values
    this._setConfigValues();

    if (this.settings.get("client", "voice.mode") === "activity") {
      this.debug("disabling voice activation mode as it is handled natively by Jitsi");
      this.settings.set("client", "voice.mode", "always");
    }

    const jitsiInit = JitsiMeetJS.init(config);
    JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
    return jitsiInit;
  }

  /* -------------------------------------------- */

  /**
     * Connect to any servers or services needed in order to provide audio/video functionality.
     * Any parameters needed in order to establish the connection should be drawn from the settings
     * object.
     * This function should return a boolean for whether the connection attempt was successful.
     * @return {Promise<boolean>}   Was the connection attempt successful?
     */
  async connect() {
    this.debug("JitsiRTCClient connect");

    // If useJitsiMeet is enabled, send a join message instead of connecting
    if (this._useJitsiMeet) {
      this.debug("useJitsiMeet set, not connecting to JitsiRTC");
      this._sendJoinMessage();
      return true;
    }

    await this.disconnect(); // Disconnect first, just in case

    // TODO check for success with these before returning?
    await this._connectServer(this.settings.get("world", "server"));
    await this._initializeLocal(this.settings.client);

    const jitsiId = this._jitsiConference.myUserId();
    this._usernameCache[game.user.id] = jitsiId;
    this._idCache[jitsiId] = game.user.id;
    return true;
  }

  /* -------------------------------------------- */

  /**
     * Disconnect from any servers or services which are used to provide audio/video functionality.
     * This function should return a boolean for whether a valid disconnection occurred.
     * @return {Promise<boolean>}   Did a disconnection occur?
     */
  async disconnect() {
    this.debug("JitsiRTCClient disconnect");
    let disconnected = false;
    if (this._jitsiConference) {
      disconnected = true;
      try {
        await this._jitsiConference.leave();
      } catch (err) {
        // Already left
      }
      this._jitsiConference = null;
    }

    if (this._jitsiConnection) {
      disconnected = true;
      this._jitsiConnection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        this._loginSuccessHandler,
      );
      this._jitsiConnection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        this._loginFailureHandler,
      );
      this._jitsiConnection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        this._onDisconnectHandler,
      );

      await this._jitsiConnection.disconnect();
    }

    return disconnected;
  }

  /* -------------------------------------------- */
  /*  Device Discovery                            */
  /* -------------------------------------------- */

  /**
     * Provide an Object of available audio sources which can be used by this implementation.
     * Each object key should be a device id and the key should be a human-readable label.
     * @return {Promise<{string: string}>}
     */
  async getAudioSinks() {
    return new Promise((resolve) => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices((list) => {
          resolve(this._deviceInfoToObject(list, "audiooutput"));
        });
      } catch (err) {
        this.onError("getAudioSinks error:", err);
        resolve({});
      }
    });
  }

  /* -------------------------------------------- */

  /**
     * Provide an Object of available audio sources which can be used by this implementation.
     * Each object key should be a device id and the key should be a human-readable label.
     * @return {Promise<{string: string}>}
     */
  async getAudioSources() {
    return new Promise((resolve) => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices((list) => {
          resolve(this._deviceInfoToObject(list, "audioinput"));
        });
      } catch (err) {
        this.onError("getAudioSources error:", err);
        resolve({});
      }
    });
  }

  /* -------------------------------------------- */

  /**
     * Provide an Object of available video sources which can be used by this implementation.
     * Each object key should be a device id and the key should be a human-readable label.
     * @return {Promise<{string: string}>}
     */
  async getVideoSources() {
    return new Promise((resolve) => {
      try {
        JitsiMeetJS.mediaDevices.enumerateDevices((list) => {
          resolve(this._deviceInfoToObject(list, "videoinput"));
        });
      } catch (err) {
        this.onError("getVideoSources error:", err);
        resolve({});
      }
    });
  }

  /* -------------------------------------------- */
  /*  Track Manipulation                          */
  /* -------------------------------------------- */

  /**
     * Return an array of Foundry User IDs which are currently connected to A/V.
     * The current user should also be included as a connected user in addition to all peers.
     * @return {string[]}           The connected User IDs
     */
  getConnectedUsers() {
    return Object.keys(this._usernameCache);
  }

  /* -------------------------------------------- */

  /**
     * Provide a MediaStream instance for a given user ID
     * @param {string} userId        The User id
     * @return {MediaStream|null}    The MediaStream for the user, or null if the user does not have
     *                                one
     */
  getMediaStreamForUser(userId) {
    const stream = this._streams[userId];
    return stream;
  }

  /* -------------------------------------------- */

  /**
     * Is outbound audio enabled for the current user?
     * @return {boolean}
     */
  isAudioEnabled() {
    return this._localAudioEnabled;
  }

  /* -------------------------------------------- */

  /**
     * Is outbound video enabled for the current user?
     * @return {boolean}
     */
  isVideoEnabled() {
    return this._localVideoEnabled;
  }

  /* -------------------------------------------- */

  /**
     * Handle a request to enable or disable the outbound audio feed for the current game user.
     * @param {boolean} enable        Whether the outbound audio track should be enabled (true) or
     *                                  disabled (false)
     */
  async toggleAudio(enable) {
    // If useJitsiMeet is enabled, return
    if (this._useJitsiMeet) {
      return;
    }

    this.debug("Toggling audio:", enable);
    if (!this._localAudioBroadcastEnabled && this.settings.client.voice.mode === "ptt") return;
    this._localAudioEnabled = enable;
    const localAudioTrack = this._jitsiConference.getLocalAudioTrack();
    if (localAudioTrack) {
      if (enable) {
        await localAudioTrack.unmute();
      } else {
        await localAudioTrack.mute();
      }
    }
  }

  /* -------------------------------------------- */

  /**
     * Set whether the outbound audio feed for the current game user is actively broadcasting.
     * This can only be true if audio is enabled, but may be false if using push-to-talk or voice
     * activation modes.
     * @param {boolean} broadcast   Whether outbound audio should be sent to connected peers or not?
     */
  async toggleBroadcast(broadcast) {
    // If useJitsiMeet is enabled, return
    if (this._useJitsiMeet) {
      return;
    }

    this.debug("Toggling Broadcast audio:", broadcast);

    this._localAudioBroadcastEnabled = broadcast;
    const localAudioTrack = this._jitsiConference.getLocalAudioTrack();
    if (localAudioTrack) {
      if (broadcast) {
        await localAudioTrack.unmute();
      } else {
        await localAudioTrack.mute();
      }
    }
  }

  /* -------------------------------------------- */

  /**
     * Handle a request to enable or disable the outbound video feed for the current game user.
     * @param {boolean} enable        Whether the outbound video track should be enabled (true) or
     *                                  disabled (false)
     */
  async toggleVideo(enable) {
    // If useJitsiMeet is enabled, return
    if (this._useJitsiMeet) {
      return;
    }

    this.debug("Toggling video:", enable);
    this._localVideoEnabled = enable;
    const localVideoTrack = this._jitsiConference.getLocalVideoTrack();
    if (localVideoTrack) {
      if (enable) {
        await localVideoTrack.unmute();
      } else {
        await localVideoTrack.mute();
      }
    }
  }

  /* -------------------------------------------- */

  /**
     * Set the Video Track for a given User ID to a provided VideoElement
     * @param {string} userId                   The User ID to set to the element
     * @param {HTMLVideoElement} videoElement   The HTMLVideoElement to which the video should be
     *                                            set
     */
  async setUserVideo(userId, videoElement) {
    this.debug("Setting video element:", videoElement, "for user:", userId);

    // If this if for our local user, attach our video track using Jitsi
    if (userId === game.user.id) {
      const localVideoTrack = this._jitsiConference.getLocalVideoTrack();
      if (localVideoTrack && videoElement) {
        localVideoTrack.attach(videoElement);
      }
      return;
    }

    // For all other users, attach the created streams
    const userStream = this.getMediaStreamForUser(userId);
    const userVideo = videoElement;

    if (userStream && userVideo) {
      try {
        userVideo.srcObject = userStream;
      } catch (error) {
        userVideo.src = window.URL.createObjectURL(userStream);
      }
    }

    const event = new CustomEvent("webrtcVideoSet", { detail: { userStream, userId } });
    videoElement.dispatchEvent(event);
  }

  /* -------------------------------------------- */
  /*  Settings and Configuration                  */
  /* -------------------------------------------- */

  /**
     * Handle changes to A/V configuration settings.
     * @param {object} changed      The settings which have changed
     */
  onSettingsChanged(changed) {
    this.debug("onSettingsChanged:", changed);
    const keys = Object.keys(flattenObject(changed));

    // Change audio or video sources
    if (keys.some((k) => ["client.videoSrc", "client.audioSrc"].includes(k))
      || hasProperty(changed, `users.${game.user.id}.canBroadcastVideo`)
      || hasProperty(changed, `users.${game.user.id}.canBroadcastAudio`)) {
      // TODO: See if we can handle this without a full reload
      window.location.reload();
    }

    // Change voice broadcasting mode
    if (keys.some((k) => ["client.voice.mode"].includes(k))) {
      // TODO: See if we can handle this without a full reload
      window.location.reload();
    }
  }

  /* -------------------------------------------- */
  /*  JitsiRTC Internal methods                   */
  /* -------------------------------------------- */

  /**
   * Connect to the WebRTC server and configure ICE/TURN servers
   * @return {Promise}
   * @private
   */
  async _connectServer(connectionSettings) {
    let auth = {};

    return new Promise((resolve) => {
      if (connectionSettings.type === "custom") {
        // Set up auth
        auth = {
          id: connectionSettings.username,
          password: connectionSettings.password,
        };
      }

      // Set a room name if one doesn't yet exist
      if (!connectionSettings.room) {
        this.debug("No meeting room set, creating random name.");
        this.settings.set("world", "server.room", randomID(32));
      }

      this._room = connectionSettings.room;
      this.debug("Meeting room name:", this._room);

      // Add the room name to the bosh & websocket URLs to ensure all users end up on the same shard
      config.bosh += `?room=${this._room}`;
      config.websocket += `?room=${this._room}`;

      this._jitsiConnection = new JitsiMeetJS.JitsiConnection(null, null, config);

      this.debug("Connection created with options:", config);

      this._loginSuccessHandler = this._loginSuccess.bind(this, resolve);
      this._jitsiConnection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        this._loginSuccessHandler,
      );

      this._loginFailureHandler = this._loginFailure.bind(this, resolve);
      this._jitsiConnection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        this._loginFailureHandler,
      );

      this._onDisconnectHandler = this._onDisconnect.bind(this);
      this._jitsiConnection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        this._onDisconnectHandler,
      );

      // Set Jitsi URL
      this.jitsiURL = `https://${config.hosts.domain}/${this._room}`;

      // If external users are allowed, add the setting
      if (game.settings.get("jitsirtc", "allowExternalUsers")) {
        game.settings.set("jitsirtc", "externalUsersUrl", this.jitsiURL);
      }

      // Connect
      this._jitsiConnection.connect(auth);

      this.debug("Async call to connect started.");
    });
  }

  async _initializeLocal({ audioSrc, videoSrc } = {}) {
    await this._closeLocalTracks();

    let videoDevice = videoSrc;
    let audioDevice = audioSrc;

    // Handle missing video device
    if (Object.entries(await this.getVideoSources()).length === 0 || (videoDevice !== "default" && !(videoDevice in await this.getVideoSources()))) {
      videoDevice = null;
    }

    // handle missing audio device
    if (Object.entries(await this.getAudioSources()).length === 0 || (audioDevice !== "default" && !(audioDevice in await this.getAudioSources()))) {
      audioDevice = null;
    }

    const devlist = [];
    let localTracks = [];
    if (audioDevice) devlist.push("audio");
    if (videoDevice) devlist.push("video");
    this.debug("Device list for createLocalTracks:", devlist);

    // Create our tracks
    if (devlist.length > 0) {
      try {
        localTracks = await JitsiMeetJS.createLocalTracks({
          devices: devlist,
          resolution: 240,
          cameraDeviceId: videoDevice,
          micDeviceId: audioDevice,
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
        });
      } catch (err) {
        this.onError("createLocalTracks error:", err);
        return false;
      }
    }

    // Add our tracks to the conference and our stream
    await this._addLocalTracks(localTracks);

    return true;
  }

  /**
   * Local tracks added handler
   * @private
   */
  async _addLocalTracks(localTracks) {
    const addedTracks = [];
    const localStream = new MediaStream();

    // Add the track to the conference
    localTracks.forEach((localTrack) => {
      addedTracks.push(this._jitsiConference.addTrack(localTrack).catch((err) => {
        this.onError("addTrack error:", err);
      }));
    });

    // Wait for all tracks to be added
    await Promise.all(addedTracks);

    // Add the track to our user's stream
    this._jitsiConference.getLocalTracks().forEach((localTrack) => {
      localStream.addTrack(localTrack.track);
    });
    this._streams[game.user.id] = localStream;
  }

  /**
   * Remove local tracks from the conference
   * @private
   */
  async _closeLocalTracks() {
    const removedTracks = [];
    this._jitsiConference.getLocalTracks().forEach((localTrack) => {
      removedTracks.push(localTrack.dispose());
    });
    return Promise.all(removedTracks);
  }

  /**
   * Connection success callback
   * @private
   */
  _loginSuccess(resolve) {
    // Set up room handle
    this._jitsiConference = this._jitsiConnection.initJitsiConference(this._room, config);
    this.debug("conference joined:", this._jitsiConference);

    // Set our jitsi username to our FVTT user ID
    this._jitsiConference.setDisplayName(game.user.id);

    // Set up jitsi event handles
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.CONFERENCE_JOINED,
      this._onConferenceJoined.bind(this, resolve),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.CONFERENCE_ERROR,
      this._onConferenceError.bind(this, resolve),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_ADDED,
      this._onRemoteTrackAdded.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_REMOVED,
      this._onRemoteTrackRemove.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_AUDIO_LEVEL_CHANGED,
      this._onTrackAudioLevelChanged.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED,
      this._onTrackMuteChanged.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.DOMINANT_SPEAKER_CHANGED,
      this._onDominantSpeakerChanged.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.TALK_WHILE_MUTED,
      this._onTalkWhileMuted.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.USER_JOINED,
      this._onUserJoined.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.USER_LEFT,
      this._onUserLeft.bind(this),
    );

    // Join the room
    this._jitsiConference.join();
  }

  /**
   * Connection failure callback
   * @private
   */
  _loginFailure(resolve, errorCode, message) {
    this.onError("Login error:", errorCode, message);
    resolve(false);
  }

  /**
   * Called when the connection to the signaling server is lost
   * @private
   */
  _onDisconnect(...args) {
    this.debug("Disconnected", args);
    this.master.reestablish();
  }

  /**
   * Handles incoming remote track
   * @param track JitsiTrack object
   */
  _onRemoteTrackAdded(jitsiTrack) {
    if (jitsiTrack.isLocal()) {
      return;
    }
    const participant = jitsiTrack.getParticipantId();

    this.debug("remote track type", jitsiTrack.getType(), "added for participant", participant);

    const userId = this._idCache[participant];

    if (userId != null) {
      const userStream = this.getMediaStreamForUser(userId);
      userStream.addTrack(jitsiTrack.track);
    } else {
      this.debug("Remote track of unknown participant", participant, "added.");
    }
    this.debug("remote track add finished, type:", jitsiTrack.getType(), "participant:", participant);

    this._render();
  }


  /**
   * Handles incoming lost remote track
   * @param track JitsiTrack object
   */
  _onRemoteTrackRemove(jitsiTrack) {
    if (jitsiTrack.isLocal()) {
      return;
    }
    const participant = jitsiTrack.getParticipantId();

    this.debug("remote track type", jitsiTrack.getType(), "removed for participant", participant);

    const userId = this._idCache[participant];

    if (userId != null) {
      const userStream = this.getMediaStreamForUser(userId);
      userStream.removeTrack(jitsiTrack.track);
    }

    this._render();
  }

  /**
   * Handles audio level of JitsiTrack has changed
   * @param participantId string
   * @param audioLevel number
   */
  _onTrackAudioLevelChanged(participantId, audioLevel) {
    if (audioLevel > 0.01) {
      ui.webrtc.setUserIsSpeaking(this._idCache[participantId], true);
    } else {
      ui.webrtc.setUserIsSpeaking(this._idCache[participantId], false);
    }
  }

  /**
   * Handles JitsiTrack was muted or unmuted
   * @param jitsiTrack JitsiTrack object
   */
  _onTrackMuteChanged(jitsiTrack) {
    if (jitsiTrack.isLocal()) {
      return;
    }
    const participant = jitsiTrack.getParticipantId();
    const isMuted = jitsiTrack.isMuted();

    this.debug("mute changed to", isMuted, "for", jitsiTrack.getType(), "for participant", participant);

    if (jitsiTrack.getType() === "video") {
      if (isMuted) {
        this._onRemoteTrackRemove(jitsiTrack);
      } else {
        this._onRemoteTrackAdded(jitsiTrack);
      }
    }
  }

  /**
   * Handles the dominant speaker is changed
   * @param id string
   */
  _onDominantSpeakerChanged(id) {
    this.debug("dominant speaker changed to", id);
  }

  /**
   * Handles the local user talking while having the microphone muted
   */
  _onTalkWhileMuted() {
    this.debug("talking while muted");
  }

  _addExternalUserData(id) {
    this.debug("Adding external Jitsi user:", id);

    // Create user data for the external user
    const data = {
      _id: id,
      active: true,
      password: "",
      role: CONST.USER_ROLES.NONE,
      permissions: {
        BROADCAST_AUDIO: true,
        BROADCAST_VIDEO: true,
      },
      avatar: CONST.DEFAULT_TOKEN,
      character: "",
      color: "#ffffff",
      flags: {},
      name: game.webrtc.client._externalUserCache[id],
    };

    // Add the external user as a tempoary user entity
    const externalUser = new User(data);
    game.users.insert(externalUser);
  }

  _onConferenceJoined(resolve) {
    this.debug("conference joined event.");
    resolve(true);
  }

  _onConferenceError(resolve, errorCode) {
    this.onError("Conference error:", errorCode);
    resolve(false);
  }

  _onUserJoined(id, participant) {
    let displayName = participant._displayName;

    // Handle Jitsi users who join the meeting directly
    if (!game.users.entities.find((u) => u.id === displayName)) {
      // Save the Jitsi display name into an external users cache
      this._externalUserCache[id] = displayName || "Jitsi User";

      // Set the stored user name equal to the Jitsi ID
      displayName = id;

      // Add the external user as a temporary user entity if external users are allowed
      if (game.settings.get("jitsirtc", "allowExternalUsers")) {
        this._addExternalUserData(id);
      } else {
        // Kick the user
        this._jitsiConference.kickParticipant(id);
      }
    }

    this._usernameCache[displayName] = id;
    this._idCache[id] = displayName;
    this._streams[displayName] = new MediaStream();
    this.debug("user joined:", displayName);

    this._render();
  }

  _onUserLeft(id) {
    this.debug("user left:", this._idCache[id]);

    delete this._streams[this._idCache[id]];
    delete this._usernameCache[this._idCache[id]];
    delete this._idCache[id];

    // Remove the temporary user entity if they are an external Jitsi user
    if (this._externalUserCache[id]) {
      delete this._externalUserCache[id];
      game.users.delete(id);
    }

    this._render();
  }

  /**
   * Provide an array of JitsiTrack objects for the given user ID
   * @param {string} userId            The User id
   * @return {JitsiTrack[]|null} The Audio Tracks for the user, or null if the user does not
   *                                    have any
   * @private
   */
  _getJitsiTracksForUser(userId) {
    if (!this._jitsiConference) {
      return null;
    }

    if (userId === game.user.id) {
      return this._jitsiConference.getLocalTracks();
    }

    const jitsiId = this._usernameCache[userId];
    if (jitsiId) {
      try {
        return this._jitsiConference.getParticipantById(jitsiId).getTracks();
      } catch (err) {
        this.onError("_getJitsiTracksForUser error:", err);
        return null;
      }
    }

    return null;
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
        obj[list[i].deviceId] = list[i].label || game.i18n.localize("WEBRTC.UnknownDevice");
      }
    }

    return obj;
  }

  /**
   * Dynamically load additional script files, returning when loaded
   * @param scriptSrc    The location of the script file
   * @private
   */
  async _loadScript(scriptSrc) {
    this.debug("Loading script", scriptSrc);
    return new Promise((resolve, reject) => {
      const scriptElement = document.createElement("script");
      $("head").append(scriptElement);

      scriptElement.type = "text/javascript";
      scriptElement.src = scriptSrc;
      scriptElement.onload = () => {
        this.debug("Loaded script", scriptSrc);
        resolve(true);
      };
      scriptElement.onerror = (err) => {
        this.onError("Error loading script", scriptSrc);
        reject(err);
      };
    });
  }

  _useCustomUrls(value) {
    if (value) {
      // Initially set to defaults
      game.settings.set("jitsirtc", "domainUrl", this._server);
      game.settings.set("jitsirtc", "mucUrl", `conference.${this._server}`);
      game.settings.set("jitsirtc", "focusUrl", `focus.${this._server}`);
      game.settings.set("jitsirtc", "boshUrl", `//${this._server}/http-bind`);
      game.settings.set("jitsirtc", "websocketUrl", `wss://${this._server}/xmpp-websocket`);
    } else {
      // Clear values
      game.settings.set("jitsirtc", "domainUrl", "");
      game.settings.set("jitsirtc", "mucUrl", "");
      game.settings.set("jitsirtc", "focusUrl", "");
      game.settings.set("jitsirtc", "boshUrl", "");
      game.settings.set("jitsirtc", "websocketUrl", "");
    }

    window.location.reload();
  }

  _setConfigValues() {
    // Use custom server config if enabled
    if (game.settings.get("jitsirtc", "customUrls")) {
      // Create hosts config object if it doesn't exist
      if (typeof (config.hosts) !== "object") {
        config.hosts = {};
      }
      config.hosts.domain = game.settings.get("jitsirtc", "domainUrl");
      config.hosts.muc = game.settings.get("jitsirtc", "mucUrl");
      config.hosts.focus = game.settings.get("jitsirtc", "focusUrl");
      config.bosh = game.settings.get("jitsirtc", "boshUrl");
      config.websocket = game.settings.get("jitsirtc", "websocketUrl");
    }

    // Create p2p config object if it doesn't exist
    if (typeof (config.p2p) !== "object") {
      config.p2p = {};
    }

    // Disable P2P connections
    config.enableP2P = false;
    config.p2p.enabled = false;

    // Disable simulcast for performance
    config.disableSimulcast = true;

    // Disable audio detections for performance
    config.enableNoAudioDetection = false;
    config.enableNoisyMicDetection = false;

    // Configure audio detection
    config.disableAudioLevels = false;
    config.audioLevelsInterval = 500;

    // Configure settings for consistant video
    config.enableLayerSuspension = false;
    config.disableSuspendVideo = true;
    config.channelLastN = -1;
    config.adaptiveLastN = false;
    delete config.lastNLimits;

    // Disable auto-muted settings
    delete config.startAudioMuted;
    delete config.startVideoMuted;

    // Remove callStats settings to avoid errors
    delete config.callStatsID;
    delete config.callStatsSecret;
    delete config.callStatsCustomScriptUrl;
  }

  _sendJoinMessage() {
    const roomId = this.settings.get("world", "server.room");

    const url = `https://${this._server}/${roomId}#userInfo.displayName=%22${game.user.id}%22`;

    const chatData = {
      content: `<a href="${url}">${game.i18n.localize("JITSIRTC.joinMessage")}</a>`,
      speaker: {
        scene: null, actor: null, token: null, alias: "JitsiRTC",
      },
      whisper: [game.user.id],
    };
    ChatMessage.create(chatData, {});
  }

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.log
   */
  debug(...args) {
    if (CONFIG.debug.avclient) console.log("JitsiRTC | ", ...args);
  }

  /**
   * Display error messages on the console
   * @param {...*} args      Arguments to console.error
   */
  onError(...args) {
    console.error("JitsiRTC | ", ...args);
  }
}

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  CONFIG.WebRTC.clientClass = JitsiRTCClient;

  AVSettings.VOICE_MODES = {
    ALWAYS: "always",
    PTT: "ptt",
  };

  game.settings.register("jitsirtc", "allowExternalUsers", {
    name: "JITSIRTC.allowExternalUsers",
    hint: "JITSIRTC.allowExternalUsersHint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "externalUsersUrl", {
    name: "JITSIRTC.externalUsersUrl",
    hint: "JITSIRTC.externalUsersUrlHint",
    scope: "client",
    config: game.settings.get("jitsirtc", "allowExternalUsers"),
    default: "",
    type: String,
    onChange: (value) => {
      if (value !== game.webrtc.client.jitsiURL) {
        game.settings.set("jitsirtc", "externalUsersUrl", game.webrtc.client.jitsiURL);
      }
    },
  });
  game.settings.register("jitsirtc", "useJitsiMeet", {
    name: "JITSIRTC.useJitsiMeet",
    hint: "JITSIRTC.useJitsiMeetHint",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "customUrls", {
    name: "JITSIRTC.customUrls",
    hint: "JITSIRTC.customUrlsHint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => game.webrtc.client._useCustomUrls(value),
  });
  game.settings.register("jitsirtc", "domainUrl", {
    name: "JITSIRTC.domainUrl",
    hint: "JITSIRTC.domainUrlHint",
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get("jitsirtc", "customUrls"),
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "mucUrl", {
    name: "JITSIRTC.mucUrl",
    hint: "JITSIRTC.mucUrlHint",
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get("jitsirtc", "customUrls"),
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "focusUrl", {
    name: "JITSIRTC.focusUrl",
    hint: "JITSIRTC.focusUrlHint",
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get("jitsirtc", "customUrls"),
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "boshUrl", {
    name: "JITSIRTC.boshUrl",
    hint: "JITSIRTC.boshUrlHint",
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get("jitsirtc", "customUrls"),
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "websocketUrl", {
    name: "JITSIRTC.websocketUrl",
    hint: "JITSIRTC.websocketUrlHint",
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get("jitsirtc", "customUrls"),
    onChange: () => window.location.reload(),
  });
  game.settings.register("jitsirtc", "debug", {
    name: "JITSIRTC.debug",
    hint: "",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => {
      CONFIG.debug.av = value;
      CONFIG.debug.avclient = value;
    },
  });

  // Enable debug logging if hidden debug setting is true
  if (game.settings.get("jitsirtc", "debug")) {
    CONFIG.debug.av = true;
    CONFIG.debug.avclient = true;
  }
});
