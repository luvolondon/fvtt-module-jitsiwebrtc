import { DEFAULT_JITSI_SERVER, MODULE_NAME } from "./utils/constants.js";

import { deviceInfoToObject, loadScript } from "./utils/helpers.js";
import * as log from "./utils/logging.js";

import JitsiClient from "./JitsiClient.js";

/**
 * An AVClient implementation that uses WebRTC and the Jitsi Meet API library.
 * @extends {AVClient}
 * @param {AVMaster} master           The master orchestration instance
 * @param {AVSettings} settings       The audio/video settings being used
 */
export default class JitsiAVClient extends AVClient {
  constructor(master, settings) {
    super(master, settings);

    this._jitsiClient = new JitsiClient(this);
  }

  /* -------------------------------------------- */
  /*  Connection                                  */
  /* -------------------------------------------- */

  /**
     * One-time initialization actions that should be performed for this client implementation.
     * This will be called only once when the Game object is first set-up.
     * @return {Promise<void>}
     */
  async initialize() {
    log.debug("JitsiAVClient initialize");
    if (this.settings.get("world", "server").type === "custom") {
      this._jitsiClient.server = this.settings.get("world", "server").url;
    } else {
      // TODO: set up server types for beta / default jitsi servers instead of just the "FVTT" type
      this._jitsiClient.server = DEFAULT_JITSI_SERVER;
    }

    // Don't fully initialize if client has enabled the option to use the full Jitsi Meet client
    if (game.settings.get(MODULE_NAME, "useJitsiMeet")) {
      log.debug("useJitsiMeet set, not initializing JitsiRTC");
      this._jitsiClient.useJitsiMeet = true;
      return true;
    }

    // Load lib-jitsi-meet and config values from the selected server
    await loadScript(`https://${this._jitsiClient.server}/libs/lib-jitsi-meet.min.js`);
    await loadScript(`https://${this._jitsiClient.server}/config.js`);

    // Set up default config values
    this._jitsiClient.setConfigValues();

    if (this.settings.get("client", "voice.mode") === "activity") {
      log.debug("Disabling voice activation mode as it is handled natively by Jitsi");
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
    log.debug("JitsiAVClient connect");

    // If useJitsiMeet is enabled, send a join message instead of connecting
    if (this._jitsiClient.useJitsiMeet) {
      log.debug("useJitsiMeet set, not connecting to JitsiRTC");
      this._jitsiClient.sendJoinMessage();
      return true;
    }

    await this.disconnect(); // Disconnect first, just in case

    // Set the connection as active
    this._jitsiClient.active = true;

    // Attempt to connect to the server
    const serverConnected = await this._jitsiClient.connectServer(this.settings.get("world", "server"));
    if (!serverConnected) {
      log.error("Server connection failed");
      return false;
    }

    await this._jitsiClient.initializeLocal(this.settings.client);

    const jitsiId = this._jitsiClient.jitsiConference.myUserId();
    this._jitsiClient.usernameCache[game.user.id] = jitsiId;
    this._jitsiClient.idCache[jitsiId] = game.user.id;
    return true;
  }

  /* -------------------------------------------- */

  /**
     * Disconnect from any servers or services which are used to provide audio/video functionality.
     * This function should return a boolean for whether a valid disconnection occurred.
     * @return {Promise<boolean>}   Did a disconnection occur?
     */
  async disconnect() {
    log.debug("JitsiAVClient disconnect");
    let disconnected = false;

    // Set the connection as inactive
    this._jitsiClient.active = false;

    // Dispose of tracks
    await this._jitsiClient.closeLocalTracks();

    // Leave the room
    if (this._jitsiClient.jitsiConference) {
      disconnected = true;
      try {
        await this._jitsiClient.jitsiConference.leave();
      } catch (err) {
        // Already left
      }
      this._jitsiClient.jitsiConference = null;
    }

    // Close the connections
    if (this._jitsiClient.jitsiConnection) {
      disconnected = true;
      this._jitsiClient.jitsiConnection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        this._jitsiClient.loginSuccessHandler,
      );
      this._jitsiClient.jitsiConnection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        this._jitsiClient.loginFailureHandler,
      );
      this._jitsiClient.jitsiConnection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        this._jitsiClient.onDisconnectHandler,
      );

      await this._jitsiClient.jitsiConnection.disconnect();
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
          resolve(deviceInfoToObject(list, "audiooutput"));
        });
      } catch (err) {
        log.error("getAudioSinks error:", err);
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
          resolve(deviceInfoToObject(list, "audioinput"));
        });
      } catch (err) {
        log.error("getAudioSources error:", err);
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
          resolve(deviceInfoToObject(list, "videoinput"));
        });
      } catch (err) {
        log.error("getVideoSources error:", err);
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
    return Object.keys(this._jitsiClient.usernameCache);
  }

  /* -------------------------------------------- */

  /**
     * Provide a MediaStream instance for a given user ID
     * @param {string} userId        The User id
     * @return {MediaStream|null}    The MediaStream for the user, or null if the user does not have
     *                                one
     */
  getMediaStreamForUser() {
    log.debug("getMediaStreamForUser called but is not used with JitsiRTC");
    return null;
  }

  /* -------------------------------------------- */

  /**
     * Is outbound audio enabled for the current user?
     * @return {boolean}
     */
  isAudioEnabled() {
    return this._jitsiClient.localAudioEnabled;
  }

  /* -------------------------------------------- */

  /**
     * Is outbound video enabled for the current user?
     * @return {boolean}
     */
  isVideoEnabled() {
    return this._jitsiClient.localVideoEnabled;
  }

  /* -------------------------------------------- */

  /**
     * Handle a request to enable or disable the outbound audio feed for the current game user.
     * @param {boolean} enable        Whether the outbound audio track should be enabled (true) or
     *                                  disabled (false)
     */
  async toggleAudio(enable) {
    // If useJitsiMeet is enabled, return
    if (this._jitsiClient.useJitsiMeet) {
      return;
    }

    log.debug("Toggling audio:", enable);
    if (!this._jitsiClient.localAudioBroadcastEnabled && this.settings.client.voice.mode === "ptt") return;
    this._jitsiClient.localAudioEnabled = enable;
    const localAudioTrack = await this._jitsiClient.jitsiConference.getLocalAudioTrack();
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
    if (this._jitsiClient.useJitsiMeet) {
      return;
    }

    log.debug("Toggling Broadcast audio:", broadcast);

    this._jitsiClient.localAudioBroadcastEnabled = broadcast;
    const localAudioTrack = await this._jitsiClient.jitsiConference.getLocalAudioTrack();
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
    if (this._jitsiClient.useJitsiMeet) {
      return;
    }

    log.debug("Toggling video:", enable);
    this._jitsiClient.localVideoEnabled = enable;
    const localVideoTrack = await this._jitsiClient.jitsiConference.getLocalVideoTrack();
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
    log.debug("Setting video element:", videoElement, "for user:", userId);

    // If this if for our local user, attach our video track using Jitsi
    if (userId === game.user.id) {
      if (!this._jitsiClient.jitsiConference) {
        log.warn("Attempted to set user video with no active Jitsi Conference; skipping");
        return;
      }
      const localVideoTrack = await this._jitsiClient.jitsiConference.getLocalVideoTrack();
      if (localVideoTrack && videoElement) {
        await localVideoTrack.attach(videoElement);
      }
      return;
    }

    // For all other users, get their video and audio streams
    const jitsiParticipant = this._jitsiClient.participantCache[userId];
    const userVideoTrack = await jitsiParticipant.getTracksByMediaType("video")[0];
    const userAudioTrack = await jitsiParticipant.getTracksByMediaType("audio")[0];

    // Add the video for the user
    if (userVideoTrack) {
      await userVideoTrack.attach(videoElement);
    }

    // Get the audio element for the user
    const audioElement = this._jitsiClient.getUserAudioElement(userId, videoElement);

    // Add the audio for the user
    if (userAudioTrack && audioElement) {
      if (JitsiMeetJS.mediaDevices.isDeviceChangeAvailable("output")) {
      // Set audio output
        userAudioTrack.setAudioOutput(this.settings.client.audioSink);
      } else if (this.settings.client.audioSink !== "default") {
        log.warn("Setting the audio output device is not available");
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
    log.debug("onSettingsChanged:", changed);
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
      this._jitsiClient.muteAll();
    }
  }
}
