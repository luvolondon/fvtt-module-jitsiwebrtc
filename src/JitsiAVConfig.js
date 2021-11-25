export default class JitsiAVConfig extends AVConfig {
  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "modules/jitsirtc/templates/av-config.html",
    });
  }

  /** @override */
  async getData(options) {
    const data = await super.getData(options);

    return mergeObject(data, {
      isVersion9: game.webrtc?.client._jitsiClient.isVersion9,
    });
  }
}
