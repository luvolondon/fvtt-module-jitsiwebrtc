import { MODULE_NAME } from "./constants.js";
import JitsiAVConfig from "../JitsiAVConfig.js";
import registerModuleSettings from "./registerModuleSettings.js";
import JitsiAVDeprecation from "../JitsiAVDeprecation.js";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  // Override voice modes
  AVSettings.VOICE_MODES = {
    ALWAYS: "always",
    PTT: "ptt",
  };

  // Register module settings
  registerModuleSettings();
});

Hooks.on("ready", () => {
  game.socket.on(`module.${MODULE_NAME}`, (request, userId) => {
    if (game.webrtc?.client?._jitsiClient) {
      game.webrtc.client._jitsiClient.onSocketEvent(request, userId);
    }
  });

  // Override the default settings menu with our own
  // WebRTC Control Menu
  game.settings.registerMenu("core", "webrtc", {
    name: "WEBRTC.Title",
    label: "WEBRTC.MenuLabel",
    hint: "WEBRTC.MenuHint",
    icon: "fas fa-headset",
    type: JitsiAVConfig,
    restricted: false,
  });

  // Show deprecation warning to GM if it isn't hidden
  const module = game.modules.get(MODULE_NAME);
  if (
    game.user.isGM &&
    game.settings.get(MODULE_NAME, "hideDeprecationWarning") !==
      module.data.version
  ) {
    const deprecationWarning = new JitsiAVDeprecation();
    deprecationWarning.render(true);
  }
});

Hooks.on("renderCameraViews", (cameraViews, cameraViewsElement) => {
  if (game.webrtc?.client?._jitsiClient) {
    game.webrtc.client._jitsiClient.onRenderCameraViews(
      cameraViews,
      cameraViewsElement
    );
  }
});

Hooks.on("getUserContextOptions", async (playersElement, contextOptions) => {
  if (game.webrtc?.client?._jitsiClient) {
    game.webrtc.client._jitsiClient.onGetUserContextOptions(
      playersElement,
      contextOptions
    );
  }
});

Hooks.on(`${MODULE_NAME}DebugSet`, (value) => {
  // Enable debug logging if debug setting is true
  CONFIG.debug.av = value;
  CONFIG.debug.avclient = value;
});
