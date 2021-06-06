import { LANG_NAME, MODULE_NAME } from "./constants.js";
import * as log from "./logging.js";

/**
 * Issue a delayed (debounced) reload to the whole window.
 * Allows settings to get saved before reload
 */
export const delayReload = debounce(() => window.location.reload(), 100);

export const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

/**
   * Transform the device info array from enumerated devices into an object with {id: label} keys
   * @param {Array} list    The list of devices
   */
export function deviceInfoToObject(list, kind) {
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
*/
export async function loadScript(scriptSrc) {
  log.debug("Loading script:", scriptSrc);
  return new Promise((resolve, reject) => {
    // Skip loading script if it is already loaded
    if ($(`script[src="${scriptSrc}"]`).length > 0) {
      log.debug("Script already loaded:", scriptSrc);
      resolve(true);
      return;
    }

    const scriptElement = document.createElement("script");
    $("head").append(scriptElement);

    scriptElement.type = "text/javascript";
    scriptElement.src = scriptSrc;
    scriptElement.onload = () => {
      log.debug("Loaded script", scriptSrc);
      resolve(true);
    };
    scriptElement.onerror = (err) => {
      log.error("Error loading script", scriptSrc);
      reject(err);
    };
  });
}

export function registerModuleSetting(settingsObject) {
  game.settings.register(MODULE_NAME, settingsObject.name, {
    name: `${LANG_NAME}.${settingsObject.name}`,
    hint: `${LANG_NAME}.${settingsObject.name}Hint`,
    scope: settingsObject.scope,
    config: settingsObject.config,
    default: settingsObject.default,
    type: settingsObject.type,
    range: settingsObject.range,
    onChange: settingsObject.onChange,
  });
}
