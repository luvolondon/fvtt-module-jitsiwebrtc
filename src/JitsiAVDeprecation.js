import { MODULE_NAME } from "./utils/constants.js";

export default class JitsiAVDeprecation extends Application {
  /** @override */
  static get defaultOptions() {
    const module = game.modules.get(MODULE_NAME);
    return mergeObject(super.defaultOptions, {
      template: "modules/jitsirtc/templates/deprecation.html",
      resizable: true,
      width: 640,
      // height: 500,
      classes: ["jitsiAVDeprecation"],
      title: module.data.title,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    const module = game.modules.get(MODULE_NAME);

    html.find(".show-again").on("change", (ev) => {
      game.settings.set(
        MODULE_NAME,
        "hideDeprecationWarning",
        ev.currentTarget.checked ? module.data.version : ""
      );
    });
  }
}
