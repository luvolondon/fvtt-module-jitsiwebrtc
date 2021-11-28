import { LANG_NAME, MODULE_NAME } from "./utils/constants.js";

import * as helpers from "./utils/helpers.js";
import * as log from "./utils/logging.js";

import JitsiBreakout from "./JitsiBreakout.js";
import JitsiCaptions from "./JitsiCaptions.js";

export default class JitsiClient {
  constructor(jitsiAvClient) {
    this.jitsiAvClient = jitsiAvClient;
    this.avMaster = jitsiAvClient.master;
    this.settings = jitsiAvClient.settings;

    this.jitsiConnection = null;
    this.jitsiConference = null;
    this.active = false;
    this.server = null;
    this.room = null;
    this.usernameCache = {};
    this.participantCache = {};
    this.idCache = {};
    this.externalUserCache = {};
    this.externalUserIdCache = {};
    this.loginSuccessHandler = null;
    this.loginFailureHandler = null;
    this.onDisconnectHandler = null;
    this.localAudioEnabled = false;
    this.localAudioBroadcastEnabled = false;
    this.localVideoEnabled = false;
    this.breakoutRoom = null;
    this.useJitsiMeet = false;
    this.jitsiURL = null;

    // Is the FVTT server version 9. TODO: Remove if we drop support for lower versions
    this.isVersion9 = isNewerVersion(
      game.version || game.data.version,
      "9.224"
    );

    this.render = debounce(this.avMaster.render.bind(this.jitsiAvClient), 2000);
  }

  /* -------------------------------------------- */
  /*  JitsiRTC Internal methods                   */
  /* -------------------------------------------- */

  /**
   * Connect to the WebRTC server and configure ICE/TURN servers
   * @return {Promise}
   */
  async connectServer(connectionSettings) {
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
        log.warn("No meeting room set, creating random name.");
        this.settings.set("world", "server.room", randomID(32));
      }

      if (this.breakoutRoom) {
        this.room = this.breakoutRoom;
      } else {
        this.room = connectionSettings.room;
      }
      log.debug("Meeting room name:", this.room);

      // Add the room name to the bosh & websocket URLs to ensure all users end up on the same shard
      config.bosh += `?room=${this.room}`;
      config.websocket += `?room=${this.room}`;

      this.jitsiConnection = new JitsiMeetJS.JitsiConnection(
        null,
        null,
        config
      );

      log.debug("Connection created with options:", config);

      this.loginSuccessHandler = this.loginSuccess.bind(this, resolve);
      this.jitsiConnection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        this.loginSuccessHandler
      );

      this.loginFailureHandler = this.loginFailure.bind(this, resolve);
      this.jitsiConnection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        this.loginFailureHandler
      );

      this.onDisconnectHandler = this.onDisconnect.bind(this);
      this.jitsiConnection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        this.onDisconnectHandler
      );

      // Set Jitsi URL
      this.jitsiURL = `https://${config.hosts.domain}/${this.room}`;

      // If external users are allowed, add the setting
      if (game.settings.get(MODULE_NAME, "allowExternalUsers")) {
        game.settings.set(MODULE_NAME, "externalUsersUrl", this.jitsiURL);
      }

      // Connect
      this.jitsiConnection.connect(auth);

      log.debug("Async call to connect started.");
    });
  }

  async initializeLocal({ audioSrc, videoSrc } = {}) {
    await this.closeLocalTracks();

    // Check for requested/allowed audio/video
    const audioRequested =
      audioSrc && this.avMaster.canUserBroadcastAudio(game.user.id);
    const videoRequested =
      videoSrc && this.avMaster.canUserBroadcastVideo(game.user.id);

    const devlist = [];
    let localTracks = [];
    if (audioRequested) devlist.push("audio");
    if (videoRequested) devlist.push("video");

    // Create our tracks
    if (devlist.length > 0) {
      localTracks = await this.createLocalTracks(devlist, audioSrc, videoSrc);

      // In case of failure attempting to capture A/V, try to capture audio only or video only
      if (!localTracks) {
        let capturedOnly = "Audio";
        if (audioRequested) {
          // Try without video first
          localTracks = await this.createLocalTracks(["audio"], audioSrc, null);
        }
        if (!localTracks && videoRequested) {
          // If it fails, try video only
          capturedOnly = "Video";
          localTracks = await this.createLocalTracks(["video"], null, videoSrc);
        }
        if (localTracks) {
          // We successfully started audio or video
          log.warn(game.i18n.localize(`WEBRTC.CaptureWarning${capturedOnly}`));
          ui.notifications.warn(
            game.i18n.localize(`WEBRTC.CaptureWarning${capturedOnly}`)
          );
        } else {
          // Nothing worked, return false
          log.warn(game.i18n.localize("WEBRTC.CaptureErrorAudioVideo"));
          ui.notifications.warn(
            game.i18n.localize("WEBRTC.CaptureErrorAudioVideo")
          );
          return false;
        }
      }
    }

    // Add our tracks to the conference and our stream
    await this.addLocalTracks(localTracks);

    // Call a debounced render
    this.render();

    return true;
  }

  async createLocalTracks(devlist, audioSrc, videoSrc) {
    log.debug("Device list for createLocalTracks:", devlist);

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
      log.warn("createLocalTracks error:", err);
      return null;
    }

    // Return the created tracks
    return localTracks;
  }

  /**
   * Local tracks added handler
   */
  async addLocalTracks(localTracks) {
    if (!this.jitsiConference) {
      log.warn(
        "Attempted to add local tracks with no active Jitsi Conference; skipping"
      );
      return;
    }

    // Add the track to the conference
    for (const localTrack of localTracks) {
      let trackAllowed = false;
      const trackType = localTrack.getType();

      // Determine if the user is allowed to add this track type
      if (
        trackType === "audio" &&
        this.avMaster.canUserBroadcastAudio(game.user.id)
      ) {
        trackAllowed = true;
        game.user?.broadcastActivity({ av: { muted: false } });
      } else if (
        trackType === "video" &&
        this.avMaster.canUserBroadcastVideo(game.user.id)
      ) {
        trackAllowed = true;
        game.user?.broadcastActivity({ av: { hidden: false } });
      }

      // Add track if allowed
      if (trackAllowed) {
        try {
          await this.jitsiConference.addTrack(localTrack);
        } catch (err) {
          log.error("addTrack error:", err);
        }
      } else {
        log.warn("Attempted to add disallowed track of type:", trackType);
      }
    }

    // Check that mute/hidden/broadcast are toggled properly
    const voiceModeAlways =
      this.settings.get("client", "voice.mode") === "always";
    await this.jitsiAvClient.toggleAudio(
      voiceModeAlways && this.avMaster.canUserShareAudio(game.user.id)
    );
    await this.jitsiAvClient.toggleVideo(
      this.avMaster.canUserShareVideo(game.user.id)
    );
    this.avMaster.broadcast(voiceModeAlways);
  }

  /**
   * Remove local tracks from the conference
   */
  async closeLocalTracks(trackType = null) {
    if (!this.jitsiConference) {
      log.debug(
        "Attempted to close local tracks with no active Jitsi Conference; skipping"
      );
      return;
    }

    for (const localTrack of this.jitsiConference.getLocalTracks()) {
      if (!trackType || localTrack.getType() === trackType) {
        await localTrack.dispose();
      }
    }
  }

  async shareDesktopTracks() {
    const desktopTracks = await this.createLocalTracks(["desktop"], null, null);

    if (!desktopTracks) {
      log.warn("Could not create desktop tracks");
      return false;
    }

    if (desktopTracks.length === 1) {
      // Only video shared, close existing track
      await this.closeLocalTracks("video");
    } else {
      // Video and Audio shared, close all tracks
      await this.closeLocalTracks();
    }

    // Add the desktop tracks to the stream
    await this.addLocalTracks(desktopTracks);

    // Call a debounced render
    this.render();

    return true;
  }

  /**
   * Connection success callback
   */
  loginSuccess(resolve) {
    // Set up room handle
    this.jitsiConference = this.jitsiConnection.initJitsiConference(
      this.room,
      config
    );
    log.debug("Conference joined:", this.jitsiConference);

    // Set our jitsi display name to our FVTT user name
    this.jitsiConference.setDisplayName(game.user.name);

    // Set a jitsi property to our FVTT user ID
    this.jitsiConference.setLocalParticipantProperty(
      "fvttUserId",
      game.user.id
    );

    // Set the preferred resolution of video to send and receive
    this.jitsiConference.setSenderVideoConstraint(240);
    this.jitsiConference.setReceiverVideoConstraint(240);

    // Set up jitsi event handles
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.CONFERENCE_JOINED,
      this.onConferenceJoined.bind(this, resolve)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.CONFERENCE_ERROR,
      this.onConferenceError.bind(this, resolve)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.ENDPOINT_MESSAGE_RECEIVED,
      this.onEndpointMessageReceived.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.MESSAGE_RECEIVED,
      this.onMessageReceived.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.CONNECTION_INTERRUPTED,
      this.onConnectionInterrupted.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.PARTICIPANT_CONN_STATUS_CHANGED,
      this.onParticipantConnStatusChanged.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.SUSPEND_DETECTED,
      this.onSuspendDetected.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_ADDED,
      this.onRemoteTrackAdded.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_REMOVED,
      this.onRemoteTrackRemove.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_AUDIO_LEVEL_CHANGED,
      this.onTrackAudioLevelChanged.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED,
      this.onTrackMuteChanged.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.USER_JOINED,
      this.onUserJoined.bind(this)
    );
    this.jitsiConference.on(
      JitsiMeetJS.events.conference.USER_LEFT,
      this.onUserLeft.bind(this)
    );

    // Join the room
    this.jitsiConference.join();
  }

  /**
   * Connection failure callback
   */
  loginFailure(resolve, errorCode, message) {
    log.error("Login error:", errorCode, message);
    resolve(false);
  }

  /**
   * Called when the connection to the signaling server is lost
   */
  onDisconnect(...args) {
    // If we should be active, reconnect
    if (this.active) {
      log.warn("Connection disconnected; reconnecting", args);
      this.avMaster.connect();
    }
  }

  /**
   * Called when the connection to the ICE server is interrupted
   */
  onConnectionInterrupted() {
    // If we should be active, reconnect
    if (this.active) {
      log.warn("Connection interrupted; reconnecting");
      this.avMaster.connect();
    }
  }

  /**
   * Notifies that a new message from another participant is received on a data channel
   * @param endpointId endpoint ID (participant ID)
   * @param endpointMessage the endpoint message
   */
  onEndpointMessageReceived(endpointId, endpointMessage) {
    switch (endpointMessage.type) {
      case "e2e-ping-request":
        break;
      case "e2e-ping-response":
        break;
      case "transcription-result":
        // Handle a transcription message
        JitsiCaptions.handleTranscription(endpointMessage, this);
        break;
      default:
        log.debug(
          "Unknown endpoint message received from",
          endpointId.getDisplayName(),
          ":",
          endpointMessage
        );
    }
  }

  /**
   * New text message received
   * @param id (string)
   * @param text (string)
   * @param ts (number)
   */
  onMessageReceived(...args) {
    log.debug("Message received:", args);
  }

  /**
   * Handles participant status changing
   * @param endpointId endpoint ID (participant ID)
   * @param newStatus the new participant status
   */
  onParticipantConnStatusChanged(endpointId, newStatus) {
    const userId = this.idCache[endpointId];
    log.warn(
      "Status changed for participant",
      endpointId,
      "(",
      userId,
      "):",
      newStatus
    );
  }

  /**
   * Handles notification of suspend detected
   */
  onSuspendDetected() {
    log.warn("Suspend detected");
  }

  /**
   * Handles incoming remote track
   * @param track JitsiTrack object
   */
  onRemoteTrackAdded(jitsiTrack) {
    if (jitsiTrack.isLocal()) {
      // Skip processing local track
      return;
    }

    const participantId = jitsiTrack.getParticipantId();
    const participant = this.jitsiConference.getParticipantById(participantId);

    // Ignore the user if they are hidden (likely a Transcriber account)
    if (participant?.isHidden()) {
      log.debug("Not adding remote track for hidden user user:", participant);
      return;
    }

    const userId = this.idCache[participantId];
    log.debug(
      "Remote track type",
      jitsiTrack.getType(),
      "added for participant",
      participant,
      "(",
      userId,
      ")"
    );

    // Call a debounced render
    this.render();
  }

  /**
   * Handles incoming lost remote track
   * @param track JitsiTrack object
   */
  onRemoteTrackRemove(jitsiTrack) {
    if (jitsiTrack.isLocal()) {
      // Skip processing local track
      return;
    }

    const participant = jitsiTrack.getParticipantId();
    const userId = this.idCache[participant];
    log.debug(
      "Remote track type",
      jitsiTrack.getType(),
      "removed for participant",
      participant,
      "(",
      userId,
      ")"
    );

    // Call a debounced render
    this.render();
  }

  /**
   * Handles audio level of JitsiTrack has changed
   * @param participantId string
   * @param audioLevel number
   */
  onTrackAudioLevelChanged(participantId, audioLevel) {
    if (audioLevel > 0.01) {
      ui.webrtc.setUserIsSpeaking(this.idCache[participantId], true);
    } else {
      ui.webrtc.setUserIsSpeaking(this.idCache[participantId], false);
    }
  }

  /**
   * Handles JitsiTrack was muted or unmuted
   * @param jitsiTrack JitsiTrack object
   */
  onTrackMuteChanged(jitsiTrack) {
    if (jitsiTrack.isLocal()) {
      return;
    }

    const participantId = jitsiTrack.getParticipantId();
    const participant = this.jitsiConference.getParticipantById(participantId);

    // Ignore the user if they are hidden (likely a Transcriber account)
    if (participant?.isHidden()) {
      log.debug("No need to handle mute for hidden user user:", participant);
      return;
    }

    const isMuted = jitsiTrack.isMuted();
    log.debug(
      "Mute changed to",
      isMuted,
      "for",
      jitsiTrack.getType(),
      "for participant",
      participant
    );

    if (jitsiTrack.getType() === "video") {
      this.render();
    }
  }

  addExternalUserData(id) {
    log.debug("Adding external Jitsi user:", id);

    // Create a new Jitsi ID for the user
    const externalUserId = randomID(16);
    this.externalUserIdCache[id] = externalUserId;

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
      name: this.externalUserCache[id],
    };

    // Add the external user as a temporary user entity
    const externalUser = new User(data);
    game.users.set(externalUser.id, externalUser);

    return externalUserId;
  }

  onConferenceJoined(resolve) {
    log.debug("Conference joined event.");

    // Enabled transcription if it is requested and ui.captions.caption is available
    if (
      this.settings.get("client", "captionsEnabled") &&
      typeof ui.captions?.caption === "function"
    ) {
      this.jitsiConference.setLocalParticipantProperty(
        "requestingTranscription",
        true
      );
    }

    resolve(true);
  }

  onConferenceError(resolve, errorCode) {
    log.error("Conference error:", errorCode);
    resolve(false);
  }

  async onUserJoined(id, participant) {
    // Await getFeatures to ensure the user is fully joined and configured
    await participant.getFeatures();

    let displayName = participant.getDisplayName();

    // Ignore the user if they are hidden (likely a Transcriber account)
    if (participant?.isHidden()) {
      log.info("Not showing hidden user:", participant);
      ui.notifications.info(
        game.i18n.format(`${LANG_NAME}.hiddenUserJoined`, { displayName })
      );
      return;
    }

    // Attempt to get the FVTT User ID from the configured property
    let fvttUserId = participant.getProperty("fvttUserId");

    // If the fvttUserId property doesn't exist, attempt to parse an ID from the displayName
    if (!fvttUserId && displayName) {
      const reDisplayName = /^(?<displayName>.*) [(](?<fvttUserId>.*)[)]$/;
      const displayNameMatch = displayName.match(reDisplayName);
      if (displayNameMatch) {
        displayName = displayNameMatch.groups.displayName;
        fvttUserId = displayNameMatch.groups.fvttUserId;
      }
    }

    // Handle Jitsi users who join the meeting directly
    if (!game.users.get(fvttUserId)) {
      // Save the Jitsi display name into an external users cache
      this.externalUserCache[id] = displayName || "Jitsi User";

      // Add the external user as a temporary user entity if external users are allowed
      if (game.settings.get(MODULE_NAME, "allowExternalUsers")) {
        // Set the stored user name equal to the ID created when adding the user
        fvttUserId = this.addExternalUserData(id);
      } else {
        // Kick the user and stop processing
        log.warn("Kicking unauthorized external user: ", displayName);
        this.jitsiConference.kickParticipant(id);
        return;
      }
    }

    const fvttUser = game.users.get(fvttUserId);
    if (!fvttUser.active) {
      // Force the user to be active. If they are signing in to Jitsi, they should be online.
      log.warn(
        "Joining user",
        fvttUserId,
        "is not listed as active. Setting to active."
      );
      fvttUser.active = true;
      ui.players.render();
    }

    this.usernameCache[fvttUserId] = id;
    this.participantCache[fvttUserId] = participant;
    this.idCache[id] = fvttUserId;

    // Clear breakout room cache if user is joining the main conference
    if (!this.breakoutRoom) {
      this.settings.set("client", `users.${fvttUserId}.jitsiBreakoutRoom`, "");
    }

    // Select all participants so their video stays active
    this.jitsiConference.selectParticipants(Object.keys(this.idCache));

    /** Set all participants to on-stage so video quality is improved.
     * We also need to set the default constraints to avoid them getting set back to jitsi defaults.
     * Uses the new format described here:
     * https://github.com/jitsi/jitsi-videobridge/blob/master/doc/allocation.md
     */
    try {
      this.jitsiConference.setReceiverConstraints({
        lastN: -1,
        onStageEndpoints: Object.keys(this.idCache),
        defaultConstraints: {
          maxHeight: 240,
          maxFrameRate: 30,
        },
      });
    } catch (err) {
      log.debug(
        "setReceiverConstraints not supported by this Jitsi version; skipping"
      );
    }

    log.debug("User joined:", fvttUserId);

    this.render();
  }

  onUserLeft(id, participant) {
    const displayName = participant.getDisplayName();

    // Ignore the user if they are hidden (likely a Transcriber account)
    if (participant?.isHidden()) {
      log.debug("No need to remove hidden user:", participant);
      ui.notifications.info(
        game.i18n.format(`${LANG_NAME}.hiddenUserLeft`, { displayName })
      );
      return;
    }

    log.debug("User left:", this.idCache[id]);

    // Clear breakout room cache if user is leaving a breakout room
    if (
      this.settings.getUser(this.idCache[id]).jitsiBreakoutRoom === this.room &&
      this.room === this.breakoutRoom
    ) {
      this.settings.set(
        "client",
        `users.${this.idCache[id]}.jitsiBreakoutRoom`,
        ""
      );
    }

    delete this.usernameCache[this.idCache[id]];
    delete this.participantCache[this.idCache[id]];
    delete this.idCache[id];

    // Remove the temporary user entity if they are an external Jitsi user
    if (this.externalUserCache[id]) {
      game.users.delete(this.externalUserIdCache[id]);
      delete this.externalUserIdCache[id];
      delete this.externalUserCache[id];
    }

    this.render();
  }

  /**
   * Obtain a reference to the video.user-audio which plays the audio channel for a requested
   * Foundry User.
   * If the element doesn't exist, but a video element does, it will create it.
   * @param {string} userId                   The ID of the User entity
   * @param {HTMLVideoElement} videoElement   The HTMLVideoElement of the user
   * @return {HTMLVideoElement|null}
   */
  getUserAudioElement(userId, videoElement = null) {
    // Find an existing audio element
    let audioElement = ui.webrtc.element.find(
      `.camera-view[data-user=${userId}] audio.user-audio`
    )[0];

    // If one doesn't exist, create it
    if (!audioElement && videoElement) {
      audioElement = document.createElement("audio");
      audioElement.className = "user-audio";
      audioElement.autoplay = true;
      videoElement.after(audioElement);

      // Bind volume control
      ui.webrtc.element
        .find(`.camera-view[data-user=${userId}] .webrtc-volume-slider`)
        .change(this.onVolumeChange.bind(this));
    }

    return audioElement;
  }

  /**
   * Change volume control for a stream
   * @param {Event} event   The originating change event from interaction with the range input
   */
  onVolumeChange(event) {
    const input = event.currentTarget;
    const box = input.closest(".camera-view");
    const volume = AudioHelper.inputToVolume(input.value);
    box.getElementsByTagName("audio")[0].volume = volume;
  }

  onRenderCameraViews(cameraViews, cameraViewsElement) {
    // Add the caption button if supported by the Jitsi server and ui.captions.caption is available
    if (
      this.settings.get("world", "server").type === "custom" &&
      this.jitsiConnection?.options?.transcribingEnabled &&
      typeof ui.captions?.caption === "function"
    ) {
      JitsiCaptions.addCaptionButton(cameraViewsElement, this);
    }
  }

  onSocketEvent(request, userId) {
    log.debug("Socket event:", request, "from:", userId);
    switch (request.action) {
      case "breakout":
        // Allow only GMs to issue breakout requests. Ignore requests that aren't for us.
        if (
          game.users.get(userId).isGM &&
          (!request.userId || request.userId === game.user.id)
        ) {
          JitsiBreakout.breakout(request.breakoutRoom, this);
        }
        break;
      default:
        log.warn("Unknown socket event:", request);
    }
  }

  onGetUserContextOptions(playersElement, contextOptions) {
    // Don't add breakout options if AV is disabled
    if (this.settings.get("world", "mode") === AVSettings.AV_MODES.DISABLED) {
      return;
    }

    JitsiBreakout.addContextOptions(contextOptions, this);
  }

  muteAll() {
    log.debug("Muting all users");

    const muted = this.settings.get("client", "muteAll");

    for (const userId of this.jitsiAvClient.getConnectedUsers()) {
      if (userId !== game.user.id) {
        const audioElement = this.getUserAudioElement(userId);
        if (audioElement) {
          audioElement.muted = muted;
        }
      }
    }
  }

  useCustomUrls(value) {
    if (value) {
      // Initially set to defaults
      game.settings.set(MODULE_NAME, "domainUrl", this.server);
      game.settings.set(MODULE_NAME, "mucUrl", `conference.${this.server}`);
      game.settings.set(MODULE_NAME, "focusUrl", `focus.${this.server}`);
      game.settings.set(MODULE_NAME, "boshUrl", `//${this.server}/http-bind`);
      game.settings.set(
        MODULE_NAME,
        "websocketUrl",
        `wss://${this.server}/xmpp-websocket`
      );
    } else {
      // Clear values
      game.settings.set(MODULE_NAME, "domainUrl", "");
      game.settings.set(MODULE_NAME, "mucUrl", "");
      game.settings.set(MODULE_NAME, "focusUrl", "");
      game.settings.set(MODULE_NAME, "boshUrl", "");
      game.settings.set(MODULE_NAME, "websocketUrl", "");
    }

    helpers.delayReload();
  }

  setConfigValues() {
    // Use custom server config if enabled
    if (game.settings.get(MODULE_NAME, "customUrls")) {
      // Create hosts config object if it doesn't exist
      if (typeof config.hosts !== "object") {
        config.hosts = {};
      }
      config.hosts.domain = game.settings.get(MODULE_NAME, "domainUrl");
      config.hosts.muc = game.settings.get(MODULE_NAME, "mucUrl");
      config.hosts.focus = game.settings.get(MODULE_NAME, "focusUrl");
      config.bosh = game.settings.get(MODULE_NAME, "boshUrl");
      config.websocket = game.settings.get(MODULE_NAME, "websocketUrl");
    }

    // Create p2p config object if it doesn't exist
    if (typeof config.p2p !== "object") {
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

    // Set an application name in case statistics are enabled
    config.applicationName = `FVTT-${game.data.version} ${MODULE_NAME}-${
      game.modules.get(MODULE_NAME).data.version
    }`;
  }

  sendJoinMessage() {
    const roomId =
      this.breakoutRoom ?? this.settings.get("world", "server.room");

    // Create a display name that includes the user name and user ID
    const uriDisplayName = encodeURI(`"${game.user.name} (${game.user.id})"`);

    // Create the url for full Jisti Meet users to join with
    const url = `https://${this.server}/${roomId}#userInfo.displayName=${uriDisplayName}&config.prejoinPageEnabled=false`;

    const joinDialog = new Dialog({
      title: game.i18n.localize(`${LANG_NAME}.joinMessage`),
      // content: `<p>${url}</p>`,
      buttons: {
        join: {
          icon: '<i class="fas fa-check"></i>',
          label: game.i18n.localize(`${LANG_NAME}.joinButton`),
          callback: () => window.open(url),
        },
        ignore: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize(`${LANG_NAME}.ignoreButton`),
          callback: () => log.debug("Ignoring Jitsi Meet join request"),
        },
      },
      default: "join",
    });
    joinDialog.render(true);
  }

  fvttAudioEnabled() {
    if (
      [AVSettings.AV_MODES.AUDIO_VIDEO, AVSettings.AV_MODES.AUDIO].includes(
        this.avMaster.mode
      )
    ) {
      return true;
    }
    return false;
  }

  fvttVideoEnabled() {
    if (
      [AVSettings.AV_MODES.AUDIO_VIDEO, AVSettings.AV_MODES.VIDEO].includes(
        this.avMaster.mode
      )
    ) {
      return true;
    }
    return false;
  }

  isUserExternal(userId) {
    return Object.values(this.externalUserIdCache).includes(userId);
  }
}
