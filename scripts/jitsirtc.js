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
    this._active = false;
    this._server = null;
    this._room = null;
    this._usernameCache = {};
    this._participantCache = {};
    this._idCache = {};
    this._externalUserCache = {};
    this._externalUserIdCache = {};
    this._loginSuccessHandler = null;
    this._loginFailureHandler = null;
    this._onDisconnectHandler = null;
    this._localAudioEnabled = false;
    this._localAudioBroadcastEnabled = false;
    this._localVideoEnabled = false;
    this._breakoutRoom = null;
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
      // TODO: set up server types for beta / default jitsi servers instead of just the "FVTT" type
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
      this.debug("Disabling voice activation mode as it is handled natively by Jitsi");
      this.settings.set("client", "voice.mode", "always");
    }

    const jitsiInit = JitsiMeetJS.init(config);

    // Set Jitsi logging level
    if (CONFIG.debug.avclient) {
      JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.DEBUG);
    } else {
      JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
    }
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

    // Set the connection as active
    this._active = true;

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

    // Set the connection as inactive
    this._active = false;

    // Dispose of tracks
    await this._closeLocalTracks();

    // Leave the room
    if (this._jitsiConference) {
      disconnected = true;
      try {
        await this._jitsiConference.leave();
      } catch (err) {
        // Already left
      }
      this._jitsiConference = null;
    }

    // Close the connections
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
  getMediaStreamForUser() {
    this.debug("getMediaStreamForUser called but is not used with JitsiRTC");
    return null;
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
      if (!this._jitsiConference) {
        this.warn("Attempted to set user video with no active Jitsi Conference; skipping");
        return;
      }
      const localVideoTrack = this._jitsiConference.getLocalVideoTrack();
      if (localVideoTrack && videoElement) {
        localVideoTrack.attach(videoElement);
      }
      return;
    }

    // For all other users, get their video and audio streams
    const jitsiParticipant = this._participantCache[userId];
    const userVideoTrack = jitsiParticipant.getTracksByMediaType("video")[0];
    const userAudioTrack = jitsiParticipant.getTracksByMediaType("audio")[0];

    // Add the video for the user
    if (userVideoTrack) {
      userVideoTrack.attach(videoElement);
    }

    // Get the audio element for the user
    const audioElement = this._getUserAudioElement(userId, videoElement);

    // Add the audio for the user
    if (userAudioTrack && audioElement) {
      if (JitsiMeetJS.mediaDevices.isDeviceChangeAvailable("output")) {
      // Set audio output
        userAudioTrack.setAudioOutput(this.settings.client.audioSink);
      } else if (this.settings.client.audioSink !== "default") {
        this.warn("Setting the audio output device is not available");
      }

      // Attach the track
      userAudioTrack.attach(audioElement);

      // Set the parameters
      audioElement.volume = this.settings.getUser(userId).volume;
      audioElement.muted = this.settings.get("client", "muteAll");
    }

    const event = new CustomEvent("webrtcVideoSet", { detail: userId });
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
      this.master.connect();
    }

    // Change voice broadcasting mode
    if (keys.some((k) => ["client.voice.mode"].includes(k))) {
      this.master.connect();
    }

    // Change audio sink device
    if (keys.some((k) => ["client.audioSink"].includes(k))) {
      this.master.connect();
    }

    // Change muteAll
    if (keys.some((k) => ["client.muteAll"].includes(k))) {
      this._muteAll();
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
        this.warn("No meeting room set, creating random name.");
        this.settings.set("world", "server.room", randomID(32));
      }

      if (this._breakoutRoom) {
        this._room = this._breakoutRoom;
      } else {
        this._room = connectionSettings.room;
      }
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

    // Check for requested/allowed audio/video
    const audioRequested = audioSrc && this.master.canUserBroadcastAudio(game.user.id);
    const videoRequested = videoSrc && this.master.canUserBroadcastVideo(game.user.id);

    const devlist = [];
    let localTracks = [];
    if (audioRequested) devlist.push("audio");
    if (videoRequested) devlist.push("video");

    // Create our tracks
    if (devlist.length > 0) {
      localTracks = await this._createLocalTracks(devlist, audioSrc, videoSrc);

      // In case of failure attempting to capture A/V, try to capture audio only or video only
      if (!localTracks) {
        let capturedOnly = "Audio";
        if (audioRequested) {
          // Try without video first
          localTracks = await this._createLocalTracks(["audio"], audioSrc, null);
        }
        if (!localTracks && videoRequested) {
          // If it fails, try video only
          capturedOnly = "Video";
          localTracks = await this._createLocalTracks(["video"], null, videoSrc);
        }
        if (localTracks) {
          // We successfully started audio or video
          this.warn(game.i18n.localize(`WEBRTC.CaptureWarning${capturedOnly}`));
          ui.notifications.warn(game.i18n.localize(`WEBRTC.CaptureWarning${capturedOnly}`));
        } else {
          // Nothing worked, return false
          this.warn(game.i18n.localize("WEBRTC.CaptureErrorAudioVideo"));
          ui.notifications.warn(game.i18n.localize("WEBRTC.CaptureErrorAudioVideo"));
          return false;
        }
      }
    }

    // Add our tracks to the conference and our stream
    await this._addLocalTracks(localTracks);

    return true;
  }

  async _createLocalTracks(devlist, audioSrc, videoSrc) {
    this.debug("Device list for createLocalTracks:", devlist);

    // Try to create the requested tracks
    let localTracks = [];
    try {
      localTracks = await JitsiMeetJS.createLocalTracks({
        devices: devlist,
        resolution: 240,
        cameraDeviceId: videoSrc,
        micDeviceId: audioSrc,
        desktopSharingFrameRate: {
          min: 5,
          max: 30,
        },
        constraints: {
          video: {
            aspectRatio: 4 / 3,
          },
        },
      });
    } catch (err) {
      this.warn("createLocalTracks error:", err);
      return null;
    }

    // Return the created tracks
    return localTracks;
  }

  /**
   * Local tracks added handler
   * @private
   */
  async _addLocalTracks(localTracks) {
    const addedTracks = [];

    if (!this._jitsiConference) {
      this.warn("Attempted to add local tracks with no active Jitsi Conference; skipping");
      return;
    }

    // Add the track to the conference
    localTracks.forEach((localTrack) => {
      let trackAllowed = false;
      const trackType = localTrack.getType();

      // Determine if the user is allowed to add this track type
      if (trackType === "audio" && this.master.canUserBroadcastAudio(game.user.id)) {
        trackAllowed = true;
      } else if (trackType === "video" && this.master.canUserBroadcastVideo(game.user.id)) {
        trackAllowed = true;
      }

      // Add track if allowed
      if (trackAllowed) {
        addedTracks.push(this._jitsiConference.addTrack(localTrack).catch((err) => {
          this.onError("addTrack error:", err);
        }));
      } else {
        this.warn("Attempted to add disallowed track of type:", trackType);
      }
    });

    // Wait for all tracks to be added
    await Promise.all(addedTracks);

    // Check that mute/hidden/broadcast are toggled properly
    const voiceModeAlways = this.settings.get("client", "voice.mode") === "always";
    this.toggleAudio(voiceModeAlways && this.master.canUserShareAudio(game.user.id));
    this.toggleVideo(this.master.canUserShareVideo(game.user.id));
    this.master.broadcast(voiceModeAlways);
  }

  /**
   * Remove local tracks from the conference
   * @private
   */
  async _closeLocalTracks(trackType = null) {
    const removedTracks = [];

    if (!this._jitsiConference) {
      this.debug("Attempted to close local tracks with no active Jitsi Conference; skipping");
      return;
    }

    this._jitsiConference.getLocalTracks().forEach((localTrack) => {
      if (!trackType || localTrack.getType() === trackType) {
        removedTracks.push(localTrack.dispose());
      }
    });

    await Promise.all(removedTracks);
  }

  async _shareDesktopTracks() {
    const desktopTracks = await game.webrtc.client._createLocalTracks(["desktop"], null, null);

    if (!desktopTracks) {
      this.warn("Could not create desktop tracks");
      return false;
    }

    if (desktopTracks.length === 1) {
      // Only video shared, close existing track
      await this._closeLocalTracks("video");
    } else {
      // Video and Audio shared, close all tracks
      await this._closeLocalTracks();
    }

    // Add the desktop tracks to the stream
    await this._addLocalTracks(desktopTracks);

    return true;
  }

  /**
   * Connection success callback
   * @private
   */
  _loginSuccess(resolve) {
    // Set up room handle
    this._jitsiConference = this._jitsiConnection.initJitsiConference(this._room, config);
    this.debug("Conference joined:", this._jitsiConference);

    // Set our jitsi username to our FVTT user ID
    this._jitsiConference.setDisplayName(game.user.id);

    // Set the preferred resolution of video to send and receive
    this._jitsiConference.setSenderVideoConstraint(240);
    this._jitsiConference.setReceiverVideoConstraint(240);

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
      JitsiMeetJS.events.conference.CONNECTION_INTERRUPTED,
      this._onConnectionInterrupted.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.PARTICIPANT_CONN_STATUS_CHANGED,
      this._onParticipantConnStatusChanged.bind(this),
    );
    this._jitsiConference.on(
      JitsiMeetJS.events.conference.SUSPEND_DETECTED,
      this._onSuspendDetected.bind(this),
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
    // If we should be active, reconnect
    if (this._active) {
      this.warn("Connection disconnected; reconnecting", args);
      this.master.connect();
    }
  }

  /**
   * Called when the connection to the ICE server is interrupted
   * @private
   */
  _onConnectionInterrupted() {
    // If we should be active, reconnect
    if (this._active) {
      this.warn("Connection interrupted; reconnecting");
      this.master.connect();
    }
  }


  /**
   * Handles participant status changing
   * @param endpointId endpoint ID (participant ID)
   * @param newStatus the new participant status
   */
  _onParticipantConnStatusChanged(endpointId, newStatus) {
    const userId = this._idCache[endpointId];
    this.warn("Status changed for participant", endpointId, "(", userId, "):", newStatus);
  }

  /**
   * Handles notification of suspend detected
   */
  _onSuspendDetected() {
    this.warn("Suspend detected");
  }

  /**
   * Handles incoming remote track
   * @param track JitsiTrack object
   */
  _onRemoteTrackAdded(jitsiTrack) {
    const participant = jitsiTrack.getParticipantId();
    const userId = this._idCache[participant];
    this.debug("Remote track type", jitsiTrack.getType(), "added for participant", participant, "(", userId, ")");

    // Call a debounced render
    this._render();
  }


  /**
   * Handles incoming lost remote track
   * @param track JitsiTrack object
   */
  _onRemoteTrackRemove(jitsiTrack) {
    const participant = jitsiTrack.getParticipantId();
    const userId = this._idCache[participant];
    this.debug("Remote track type", jitsiTrack.getType(), "removed for participant", participant, "(", userId, ")");

    // Call a debounced render
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

    this.debug("Mute changed to", isMuted, "for", jitsiTrack.getType(), "for participant", participant);

    if (jitsiTrack.getType() === "video") {
      this._render();
    }
  }

  _addExternalUserData(id) {
    this.debug("Adding external Jitsi user:", id);

    // Create a new Jitsi ID for the user
    const externalUserId = randomID(16);
    this._externalUserIdCache[id] = externalUserId;

    // Create user data for the external user
    const data = {
      _id: externalUserId,
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

    // Add the external user as a temporary user entity
    const externalUser = new User(data);
    game.users.insert(externalUser);

    return externalUserId;
  }

  _onConferenceJoined(resolve) {
    this.debug("Conference joined event.");
    resolve(true);
  }

  _onConferenceError(resolve, errorCode) {
    this.onError("Conference error:", errorCode);
    resolve(false);
  }

  _onUserJoined(id, participant) {
    let displayName = participant._displayName;

    // Handle Jitsi users who join the meeting directly
    if (!game.users.get(displayName)) {
      // Save the Jitsi display name into an external users cache
      this._externalUserCache[id] = displayName || "Jitsi User";

      // Add the external user as a temporary user entity if external users are allowed
      if (game.settings.get("jitsirtc", "allowExternalUsers")) {
        // Set the stored user name equal to the ID created when adding the user
        displayName = this._addExternalUserData(id);
      } else {
        // Kick the user and stop processing
        this._jitsiConference.kickParticipant(id);
        return;
      }
    }

    const fvttUser = game.users.get(displayName);
    if (!fvttUser.active) {
      // Force the user to be active. If they are signing in to Jitsi, they should be online.
      this.warn("Joining user", displayName, "is not listed as active. Setting to active.");
      fvttUser.active = true;
      ui.players.render();
    }

    this._usernameCache[displayName] = id;
    this._participantCache[displayName] = participant;
    this._idCache[id] = displayName;

    // Clear breakout room cache if user is joining the main conference
    if (!this._breakoutRoom) {
      this.settings.set("client", `users.${displayName}.jitsiBreakoutRoom`, "");
    }

    // Select all participants so their video stays active
    this._jitsiConference.selectParticipants(Object.keys(game.webrtc.client._idCache));

    /** Set all participants to on-stage so video quality is improved.
     * We also need to set the default constraints to avoid them getting set back to jitsi defaults.
     * Uses the new format described here:
     * https://github.com/jitsi/jitsi-videobridge/blob/master/doc/allocation.md
    */
    try {
      this._jitsiConference.setReceiverConstraints({
        lastN: -1,
        onStageEndpoints: Object.keys(game.webrtc.client._idCache),
        defaultConstraints: {
          maxHeight: 240,
          maxFrameRate: 30,
        },
      });
    } catch (err) {
      this.debug("setReceiverConstraints not supported by this Jitsi version; skipping");
    }

    this.debug("User joined:", displayName);

    this._render();
  }

  _onUserLeft(id) {
    this.debug("User left:", this._idCache[id]);

    // Clear breakout room cache if user is leaving a breakout room
    if (
      this.settings.getUser(this._idCache[id]).jitsiBreakoutRoom === this._room
      && this._room === this._breakoutRoom
    ) {
      this.settings.set("client", `users.${this._idCache[id]}.jitsiBreakoutRoom`, "");
    }

    delete this._usernameCache[this._idCache[id]];
    delete this._participantCache[this._idCache[id]];
    delete this._idCache[id];

    // Remove the temporary user entity if they are an external Jitsi user
    if (this._externalUserCache[id]) {
      game.users.delete(this._externalUserIdCache[id]);
      delete this._externalUserIdCache[id];
      delete this._externalUserCache[id];
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
   * Obtain a reference to the video.user-audio which plays the audio channel for a requested
   * Foundry User.
   * If the element doesn't exist, but a video element does, it will create it.
   * @param {string} userId                   The ID of the User entity
   * @param {HTMLVideoElement} videoElement   The HTMLVideoElement of the user
   * @return {HTMLVideoElement|null}
   */
  _getUserAudioElement(userId, videoElement = null) {
    // Find an existing audio element
    let audioElement = ui.webrtc.element.find(`.camera-view[data-user=${userId}] audio.user-audio`)[0];

    // If one doesn't exist, create it
    if (!audioElement && videoElement) {
      audioElement = document.createElement("audio");
      audioElement.className = "user-audio";
      audioElement.autoplay = true;
      videoElement.after(audioElement);

      // Bind volume control
      ui.webrtc.element.find(`.camera-view[data-user=${userId}] .webrtc-volume-slider`).change(this._onVolumeChange.bind(this));
    }

    return audioElement;
  }

  /**
   * Change volume control for a stream
   * @param {Event} event   The originating change event from interaction with the range input
   * @private
   */
  _onVolumeChange(event) {
    const input = event.currentTarget;
    const box = input.closest(".camera-view");
    const volume = AudioHelper.inputToVolume(input.value);
    box.getElementsByTagName("audio")[0].volume = volume;
  }

  /**
   * Mute all audio tracks
   * @private
   */
  _muteAll() {
    this.debug("Muting all users");

    const muted = this.settings.get("client", "muteAll");

    this.getConnectedUsers().forEach((userId) => {
      if (userId !== game.user.id) {
        const audioElement = this._getUserAudioElement(userId);
        if (audioElement) {
          audioElement.muted = muted;
        }
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

    // Disable audio detections for performance
    config.enableNoAudioDetection = false;
    config.enableNoisyMicDetection = false;

    // Configure audio detection
    config.disableAudioLevels = false;
    config.audioLevelsInterval = 500;

    // Configure settings for consistent video
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
    const roomId = this._breakoutRoom ?? this.settings.get("world", "server.room");

    const url = `https://${this._server}/${roomId}#userInfo.displayName=%22${game.user.id}%22&config.prejoinPageEnabled=false`;

    const joinDialog = new Dialog({
      title: game.i18n.localize("JITSIRTC.joinMessage"),
      // content: `<p>${url}</p>`,
      buttons: {
        join: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize("JITSIRTC.joinButton"),
          callback: () => window.open(url),
        },
        ignore: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("JITSIRTC.ignoreButton"),
          callback: () => (this.debug("Ignoring Jitsi Meet join request")),
        },
      },
      default: "join",
    });
    joinDialog.render(true);
  }

  _fvttAudioEnabled() {
    if ([AVSettings.AV_MODES.AUDIO_VIDEO, AVSettings.AV_MODES.AUDIO].includes(this.master.mode)) {
      return true;
    }
    return false;
  }

  _fvttVideoEnabled() {
    if ([AVSettings.AV_MODES.AUDIO_VIDEO, AVSettings.AV_MODES.VIDEO].includes(this.master.mode)) {
      return true;
    }
    return false;
  }

  _breakout(breakoutRoom) {
    if (breakoutRoom === this._breakoutRoom) {
      // Already in this room, skip
      return;
    }

    this.debug("Switching to breakout room:", breakoutRoom);
    this._breakoutRoom = breakoutRoom;
    this.connect();
  }

  _startBreakout(userId, breakoutRoom) {
    if (!game.user.isGM) {
      this.warn("Only a GM can start a breakout conference room");
      return;
    }

    this.settings.set("client", `users.${userId}.jitsiBreakoutRoom`, breakoutRoom);
    game.socket.emit("module.jitsirtc", {
      action: "breakout",
      userId,
      breakoutRoom,
    });
  }

  _endUserBreakout(userId) {
    if (!game.user.isGM) {
      this.warn("Only a GM can end a user's breakout conference");
      return;
    }

    this.settings.set("client", `users.${userId}.jitsiBreakoutRoom`, "");
    game.socket.emit("module.jitsirtc", {
      action: "breakout",
      userId,
      breakoutRoom: null,
    });
  }

  _endAllBreakouts() {
    if (!game.user.isGM) {
      this.warn("Only a GM can end all breakout conference rooms");
      return;
    }

    game.socket.emit("module.jitsirtc", {
      action: "breakout",
      userId: null,
      breakoutRoom: null,
    });

    if (this._breakoutRoom) {
      this._breakout(null);
    }
  }

  _isUserExternal(userId) {
    return Object.values(this._externalUserIdCache).includes(userId);
  }

  /**
   * Display debug messages on the console if debugging is enabled
   * @param {...*} args      Arguments to console.log
   */
  debug(...args) {
    if (CONFIG.debug.avclient) console.log("JitsiRTC | ", ...args);
  }

  /**
   * Display warning messages on the console
   * @param {...*} args      Arguments to console.error
   */
  warn(...args) {
    console.warn("JitsiRTC | ", ...args);
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
  game.settings.register("jitsirtc", "resetRoom", {
    name: "JITSIRTC.resetRoom",
    hint: "JITSIRTC.resetRoomHint",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => {
      if (value) {
        game.webrtc.client.warn("Resetting Jitsi meeting room ID");
        game.settings.set("jitsirtc", "resetRoom", false);
        game.webrtc.client.settings.set("world", "server.room", randomID(32));
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

Hooks.on("ready", () => {
  game.socket.on("module.jitsirtc", (request, userId) => {
    game.webrtc.client.debug("Socket event:", request, "from:", userId);
    switch (request.action) {
      case "breakout":
        // Allow only GMs to issue breakout requests. Ignore requests that aren't for us.
        if (game.users.get(userId).isGM && (!request.userId || request.userId === game.user.id)) {
          game.webrtc.client._breakout(request.breakoutRoom);
        }
        break;
      default:
        game.webrtc.client.warn("Unknown socket event:", request);
    }
  });
});

Hooks.on("getUserContextOptions", async (html, options) => {
  // Don't add breakout options if AV is disabled
  if (game.webrtc.settings.get("world", "mode") === AVSettings.AV_MODES.DISABLED) {
    return;
  }

  // Add breakout options to the playerlist context menus
  options.push(
    {
      name: game.i18n.localize("JITSIRTC.startAVBreakout"),
      icon: '<i class="fa fa-comment"></i>',
      condition: (players) => {
        const { userId } = players[0].dataset;
        const { jitsiBreakoutRoom } = game.webrtc.client.settings.getUser(userId);
        return (
          game.user.isGM
          && !jitsiBreakoutRoom
          && userId !== game.user.id
          && !game.webrtc.client._isUserExternal(userId)
        );
      },
      callback: (players) => {
        const breakoutRoom = randomID(32);
        game.webrtc.client._startBreakout(players.data("user-id"), breakoutRoom);
        game.webrtc.client._breakout(breakoutRoom);
      },
    },
    {
      name: game.i18n.localize("JITSIRTC.joinAVBreakout"),
      icon: '<i class="fas fa-comment-dots"></i>',
      condition: (players) => {
        const { userId } = players[0].dataset;
        const { jitsiBreakoutRoom } = game.webrtc.client.settings.getUser(userId);
        return (
          game.user.isGM
          && game.webrtc.client.settings.getUser(userId).jitsiBreakoutRoom
          && game.webrtc.client._breakoutRoom !== jitsiBreakoutRoom
          && userId !== game.user.id
        );
      },
      callback: (players) => {
        const { userId } = players[0].dataset;
        const { jitsiBreakoutRoom } = game.webrtc.client.settings.getUser(userId);
        game.webrtc.client._breakout(jitsiBreakoutRoom);
      },
    },
    {
      name: game.i18n.localize("JITSIRTC.pullToAVBreakout"),
      icon: '<i class="fas fa-comments"></i>',
      condition: (players) => {
        const { userId } = players[0].dataset;
        const { jitsiBreakoutRoom } = game.webrtc.client.settings.getUser(userId);
        return (
          game.user.isGM
          && game.webrtc.client._breakoutRoom
          && jitsiBreakoutRoom !== game.webrtc.client._breakoutRoom
          && userId !== game.user.id
          && !game.webrtc.client._isUserExternal(userId)
        );
      },
      callback: (players) => { game.webrtc.client._startBreakout(players.data("user-id"), game.webrtc.client._breakoutRoom); },
    },
    {
      name: game.i18n.localize("JITSIRTC.leaveAVBreakout"),
      icon: '<i class="fas fa-comment-slash"></i>',
      condition: (players) => {
        const { userId } = players[0].dataset;
        return (
          userId === game.user.id
          && game.webrtc.client._breakoutRoom
        );
      },
      callback: () => { game.webrtc.client._breakout(null); },
    },
    {
      name: game.i18n.localize("JITSIRTC.removeFromAVBreakout"),
      icon: '<i class="fas fa-comment-slash"></i>',
      condition: (players) => {
        const { userId } = players[0].dataset;
        const { jitsiBreakoutRoom } = game.webrtc.client.settings.getUser(userId);
        return (
          game.user.isGM
          && jitsiBreakoutRoom
          && userId !== game.user.id
        );
      },
      callback: (players) => {
        game.webrtc.client._endUserBreakout(players[0].dataset.userId);
      },
    },
    {
      name: game.i18n.localize("JITSIRTC.endAllAVBreakouts"),
      icon: '<i class="fas fa-ban"></i>',
      condition: (players) => {
        const { userId } = players[0].dataset;
        return (
          game.user.isGM
          && userId === game.user.id
        );
      },
      callback: () => { game.webrtc.client._endAllBreakouts(); },
    },
  );
});
