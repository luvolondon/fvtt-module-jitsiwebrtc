import { MODULE_NAME } from "./constants.js";
import * as helpers from "./helpers.js";
import * as log from "./logging.js";

export default function registerModuleSettings() {
  helpers.registerModuleSetting({
    name: "allowExternalUsers",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => helpers.delayReload(),
  });

  helpers.registerModuleSetting({
    name: "externalUsersUrl",
    scope: "client",
    config: game.settings.get(MODULE_NAME, "allowExternalUsers"),
    default: "",
    type: String,
    onChange: (value) => {
      if (value !== game.webrtc.client._jitsiClient.jitsiURL) {
        game.settings.set(MODULE_NAME, "externalUsersUrl", game.webrtc.client._jitsiClient.jitsiURL);
      }
    },
  });

  helpers.registerModuleSetting({
    name: "resetRoom",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => {
      if (value && game.user.isGM) {
        log.warn("Resetting Jitsi meeting room ID");
        game.settings.set(MODULE_NAME, "resetRoom", false);
        game.webrtc.client.settings.set("world", "server.room", randomID(32));
      }
    },
  });

  helpers.registerModuleSetting({
    name: "useJitsiMeet",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => helpers.delayReload(),
  });

  helpers.registerModuleSetting({
    name: "customUrls",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => game.webrtc.client._jitsiClient.useCustomUrls(value),
  });

  helpers.registerModuleSetting({
    name: "domainUrl",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "customUrls"),
    default: "",
    type: String,
    onChange: () => helpers.delayReload(),
  });

  helpers.registerModuleSetting({
    name: "mucUrl",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "customUrls"),
    default: "",
    type: String,
    onChange: () => helpers.delayReload(),
  });

  helpers.registerModuleSetting({
    name: "focusUrl",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "customUrls"),
    default: "",
    type: String,
    onChange: () => helpers.delayReload(),
  });

  helpers.registerModuleSetting({
    name: "boshUrl",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "customUrls"),
    default: "",
    type: String,
    onChange: () => helpers.delayReload(),
  });

  helpers.registerModuleSetting({
    name: "websocketUrl",
    scope: "world",
    config: game.settings.get(MODULE_NAME, "customUrls"),
    default: "",
    type: String,
    onChange: () => helpers.delayReload(),
  });

  // Register debug logging setting
  helpers.registerModuleSetting({
    name: "debug",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => log.setDebug(value),
  });

  // Set the initial debug level
  log.setDebug(game.settings.get(MODULE_NAME, "debug"));
}
