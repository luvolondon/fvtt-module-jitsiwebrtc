/**
 * An AVClient implementation that uses WebRTC and the Jitsi Meet API library.
 * @extends {AVClient}
 * @param {AVMaster} master           The master orchestration instance
 * @param {AVSettings} settings       The audio/video settings being used
 */
class JitsiRTCClient extends AVClient {
  constructor(master, settings) {
    super(master, settings);

    this.master = master;
    this.settings = settings;
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
    throw Error("The initialize() method must be defined by an AVClient subclass.");
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
    throw Error("The connect() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Disconnect from any servers or services which are used to provide audio/video functionality.
     * This function should return a boolean for whether a valid disconnection occurred.
     * @return {Promise<boolean>}   Did a disconnection occur?
     */
  async disconnect() {
    throw Error("The disconnect() method must be defined by an AVClient subclass.");
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
    throw Error("The getAudioSinks() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Provide an Object of available audio sources which can be used by this implementation.
     * Each object key should be a device id and the key should be a human-readable label.
     * @return {Promise<{string: string}>}
     */
  async getAudioSources() {
    throw Error("The getAudioSources() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Provide an Object of available video sources which can be used by this implementation.
     * Each object key should be a device id and the key should be a human-readable label.
     * @return {Promise<{string: string}>}
     */
  async getVideoSources() {
    throw Error("The getVideoSources() method must be defined by an AVClient subclass.");
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
    throw Error("The getConnectedUsers() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Provide a MediaStream instance for a given user ID
     * @param {string} userId        The User id
     * @return {MediaStream|null}    The MediaStream for the user, or null if the user does not have
     *                                one
     */
  getMediaStreamForUser() {
    throw Error("The getMediaStreamForUser() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Provide a Video Track instance for a given user ID
     * @param {string} userId        The User id
     * @return {VideoTrack|null}     The VideoTrack for the user, or null if the user does not have
     *                                one
     */
  getVideoTrackForUser() {
    throw Error("The getVideoTrackForUser() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Provide an Audio Track instance for a given user ID
     * @param {string} userId        The User id
     * @return {AudioTrack|null}     The AudioTrack for the user, or null if the user does not have
     *                                one
     */
  getAudioTrackForUser() {
    throw Error("The getAudioTrackForUser() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Is outbound audio enabled for the current user?
     * @return {boolean}
     */
  isAudioEnabled() {
    throw Error("The isAudioEnabled() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Is outbound video enabled for the current user?
     * @return {boolean}
     */
  isVideoEnabled() {
    throw Error("The isVideoEnabled() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Handle a request to enable or disable the outbound video feed for the current game user.
     * @param {boolean} enable        Whether the outbound audio track should be enabled (true) or
     *                                  disabled (false)
     */
  toggleAudio() {
    throw Error("The toggleAudio() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Handle a request to enable or disable the outbound video feed for the current game user.
     * @param {boolean} enable        Whether the outbound audio track should be enabled (true) or
     *                                  disabled (false)
     */
  toggleVideo() {
    throw Error("The toggleVideo() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */

  /**
     * Set the Video Track for a given User ID to a provided VideoElement
     * @param {string} userId                   The User ID to set to the element
     * @param {HTMLVideoElement} videoElement   The HTMLVideoElement to which the video should be
     *                                            set
     */
  async setUserVideo() {
    throw Error("The setUserVideo() method must be defined by an AVClient subclass.");
  }

  /* -------------------------------------------- */
  /*  Settings and Configuration                  */
  /* -------------------------------------------- */

  /**
     * Handle changes to A/V configuration settings.
     * @param {object} changed      The settings which have changed
     */
  onSettingsChanged() {
    throw Error("The onSettingsChanged() method must be defined by an AVClient subclass.");
  }
}

Hooks.on("init", () => {
  CONFIG.WebRTC.clientClass = JitsiRTCClient;
});
