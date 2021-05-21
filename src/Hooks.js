import { LANG_NAME, MODULE_NAME } from "./Constants.js";
import * as log from "./Logging.js";

/* -------------------------------------------- */
/*  Hook calls                                  */
/* -------------------------------------------- */

Hooks.on("init", () => {
  AVSettings.VOICE_MODES = {
    ALWAYS: "always",
    PTT: "ptt",
  };

  game.settings.register(MODULE_NAME, "allowExternalUsers", {
    name: `${LANG_NAME}.allowExternalUsers`,
    hint: `${LANG_NAME}.allowExternalUsersHint`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => game.webrtc.client._reload(),
  });
  game.settings.register(MODULE_NAME, "externalUsersUrl", {
    name: `${LANG_NAME}.externalUsersUrl`,
    hint: `${LANG_NAME}.externalUsersUrlHint`,
    scope: "client",
    config: game.settings.get(MODULE_NAME, "allowExternalUsers"),
    default: "",
    type: String,
    onChange: (value) => {
      if (value !== game.webrtc.client.jitsiURL) {
        game.settings.set(MODULE_NAME, "externalUsersUrl", game.webrtc.client.jitsiURL);
      }
    },
  });
  game.settings.register(MODULE_NAME, "resetRoom", {
    name: `${LANG_NAME}.resetRoom`,
    hint: `${LANG_NAME}.resetRoomHint`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => {
      if (value) {
        log.warn("Resetting Jitsi meeting room ID");
        game.settings.set(MODULE_NAME, "resetRoom", false);
        game.webrtc.client.settings.set("world", "server.room", randomID(32));
      }
    },
  });
  game.settings.register(MODULE_NAME, "useJitsiMeet", {
    name: `${LANG_NAME}.useJitsiMeet`,
    hint: `${LANG_NAME}.useJitsiMeetHint`,
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => game.webrtc.client._reload(),
  });
  game.settings.register(MODULE_NAME, "customUrls", {
    name: `${LANG_NAME}.customUrls`,
    hint: `${LANG_NAME}.customUrlsHint`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => game.webrtc.client._useCustomUrls(value),
  });
  game.settings.register(MODULE_NAME, "domainUrl", {
    name: `${LANG_NAME}.domainUrl`,
    hint: `${LANG_NAME}.domainUrlHint`,
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get(MODULE_NAME, "customUrls"),
    onChange: () => game.webrtc.client._reload(),
  });
  game.settings.register(MODULE_NAME, "mucUrl", {
    name: `${LANG_NAME}.mucUrl`,
    hint: `${LANG_NAME}.mucUrlHint`,
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get(MODULE_NAME, "customUrls"),
    onChange: () => game.webrtc.client._reload(),
  });
  game.settings.register(MODULE_NAME, "focusUrl", {
    name: `${LANG_NAME}.focusUrl`,
    hint: `${LANG_NAME}.focusUrlHint`,
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get(MODULE_NAME, "customUrls"),
    onChange: () => game.webrtc.client._reload(),
  });
  game.settings.register(MODULE_NAME, "boshUrl", {
    name: `${LANG_NAME}.boshUrl`,
    hint: `${LANG_NAME}.boshUrlHint`,
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get(MODULE_NAME, "customUrls"),
    onChange: () => game.webrtc.client._reload(),
  });
  game.settings.register(MODULE_NAME, "websocketUrl", {
    name: `${LANG_NAME}.websocketUrl`,
    hint: `${LANG_NAME}.websocketUrlHint`,
    default: "",
    scope: "world",
    type: String,
    config: game.settings.get(MODULE_NAME, "customUrls"),
    onChange: () => game.webrtc.client._reload(),
  });
});

Hooks.on("ready", () => {
  game.socket.on(`module.${MODULE_NAME}`, (request, userId) => {
    log.debug("Socket event:", request, "from:", userId);
    switch (request.action) {
      case "breakout":
        // Allow only GMs to issue breakout requests. Ignore requests that aren't for us.
        if (game.users.get(userId).isGM && (!request.userId || request.userId === game.user.id)) {
          game.webrtc.client._breakout(request.breakoutRoom);
        }
        break;
      default:
        log.warn("Unknown socket event:", request);
    }
  });
});

Hooks.on("renderCameraViews", (cameraViews, html) => {
  if (game.webrtc?.client) {
    game.webrtc.client._onRenderCameraViews(html);
  }
});

Hooks.on("getUserContextOptions", async (html, options) => {
  // Don't add breakout options if AV is disabled
  if (game.webrtc.settings.get("world", "mode") === AVSettings.AV_MODES.DISABLED) {
    return;
  }

  // Add breakout options to the playerlist context menus
  options.push(
    {
      name: game.i18n.localize(`${LANG_NAME}.startAVBreakout`),
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
      name: game.i18n.localize(`${LANG_NAME}.joinAVBreakout`),
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
      name: game.i18n.localize(`${LANG_NAME}.pullToAVBreakout`),
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
      name: game.i18n.localize(`${LANG_NAME}.leaveAVBreakout`),
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
      name: game.i18n.localize(`${LANG_NAME}.removeFromAVBreakout`),
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
      name: game.i18n.localize(`${LANG_NAME}.endAllAVBreakouts`),
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

Hooks.on(`${MODULE_NAME}DebugSet`, (value) => {
  // Enable debug logging if debug setting is true
  CONFIG.debug.av = value;
  CONFIG.debug.avclient = value;
});
