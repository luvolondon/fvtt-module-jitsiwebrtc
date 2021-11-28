import * as log from "./utils/logging.js";

export default class JitsiCaptions {
  /**
   * Add caption button
   * @param {Object} cameraViewsElement
   */
  static addCaptionButton(cameraViewsElement, jitsiClient) {
    const cameraBox = cameraViewsElement.find(`[data-user="${game.user.id}"]`);
    const notificationElement = cameraBox.find(".notification-bar");

    const captionButton = $(
      '<a class="av-control toggle" title="Start subtitles" data-action="toggle-captions"><i class="fas fa-closed-captioning"></i></a>'
    );
    captionButton.on("click", (event) =>
      JitsiCaptions.onCaptionButtonClicked(event, jitsiClient)
    );

    // Set the button active state
    const captionsEnabled = !!jitsiClient.settings.get(
      "client",
      "captionsEnabled"
    );
    captionButton.children("i")[0].classList.toggle("active", captionsEnabled);

    notificationElement.prepend(captionButton);
  }

  /**
   * Handle transcription messages
   * @param {Object} transcriptionMessage
   */
  static handleTranscription(transcriptionMessage, jitsiClient) {
    if (!jitsiClient.settings.get("client", "captionsEnabled")) {
      // Skip transcriptions if they aren't enabled
      return;
    }

    log.debug("transcriptionMessage:", transcriptionMessage);
    const participantId = transcriptionMessage.participant.id;
    const transcriptionId = transcriptionMessage.message_id;
    const fvttUser = game.users.get(jitsiClient.idCache[participantId]);
    const transcriptionText = transcriptionMessage.transcript[0].text;
    ui.captions.caption(transcriptionId, fvttUser, transcriptionText);
  }

  static onCaptionButtonClicked(event, jitsiClient) {
    // Get current caption state
    const captionsEnabled = !!jitsiClient.settings.get(
      "client",
      "captionsEnabled"
    );

    log.debug("Toggling captions to:", !captionsEnabled);

    // Set the caption state
    jitsiClient.settings.set("client", "captionsEnabled", !captionsEnabled);
    jitsiClient.jitsiConference.setLocalParticipantProperty(
      "requestingTranscription",
      !captionsEnabled
    );
    event.target.classList.toggle("active", !captionsEnabled);
  }
}
