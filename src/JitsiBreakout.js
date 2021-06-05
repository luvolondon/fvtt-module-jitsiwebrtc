import {
  LANG_NAME,
  MODULE_NAME,
} from "./utils/constants.js";

import * as log from "./utils/logging.js";

export default class JitsiBreakout {
  static addContextOptions(contextOptions, jitsiClient) {
    // Add breakout options to the playerlist context menus
    contextOptions.push(
      {
        name: game.i18n.localize(`${LANG_NAME}.startAVBreakout`),
        icon: '<i class="fa fa-comment"></i>',
        condition: (players) => {
          const { userId } = players[0].dataset;
          const { jitsiBreakoutRoom } = jitsiClient.settings.getUser(userId);
          return (
            game.user.isGM
            && !jitsiBreakoutRoom
            && userId !== game.user.id
            && !jitsiClient.isUserExternal(userId)
          );
        },
        callback: (players) => {
          const breakoutRoom = randomID(32);
          JitsiBreakout.startBreakout(players.data("user-id"), breakoutRoom, jitsiClient);
          JitsiBreakout.breakout(breakoutRoom, jitsiClient);
        },
      },
      {
        name: game.i18n.localize(`${LANG_NAME}.joinAVBreakout`),
        icon: '<i class="fas fa-comment-dots"></i>',
        condition: (players) => {
          const { userId } = players[0].dataset;
          const { jitsiBreakoutRoom } = jitsiClient.settings.getUser(userId);
          return (
            game.user.isGM
            && jitsiClient.settings.getUser(userId).jitsiBreakoutRoom
            && jitsiClient.breakoutRoom !== jitsiBreakoutRoom
            && userId !== game.user.id
          );
        },
        callback: (players) => {
          const { userId } = players[0].dataset;
          const { jitsiBreakoutRoom } = jitsiClient.settings.getUser(userId);
          JitsiBreakout.breakout(jitsiBreakoutRoom, jitsiClient);
        },
      },
      {
        name: game.i18n.localize(`${LANG_NAME}.pullToAVBreakout`),
        icon: '<i class="fas fa-comments"></i>',
        condition: (players) => {
          const { userId } = players[0].dataset;
          const { jitsiBreakoutRoom } = jitsiClient.settings.getUser(userId);
          return (
            game.user.isGM
            && jitsiClient.breakoutRoom
            && jitsiBreakoutRoom !== jitsiClient.breakoutRoom
            && userId !== game.user.id
            && !jitsiClient.isUserExternal(userId)
          );
        },
        callback: (players) => { JitsiBreakout.startBreakout(players.data("user-id"), jitsiClient.breakoutRoom, jitsiClient); },
      },
      {
        name: game.i18n.localize(`${LANG_NAME}.leaveAVBreakout`),
        icon: '<i class="fas fa-comment-slash"></i>',
        condition: (players) => {
          const { userId } = players[0].dataset;
          return (
            userId === game.user.id
            && jitsiClient.breakoutRoom
          );
        },
        callback: () => { JitsiBreakout.breakout(null, jitsiClient); },
      },
      {
        name: game.i18n.localize(`${LANG_NAME}.removeFromAVBreakout`),
        icon: '<i class="fas fa-comment-slash"></i>',
        condition: (players) => {
          const { userId } = players[0].dataset;
          const { jitsiBreakoutRoom } = jitsiClient.settings.getUser(userId);
          return (
            game.user.isGM
            && jitsiBreakoutRoom
            && userId !== game.user.id
          );
        },
        callback: (players) => {
          JitsiBreakout.endUserBreakout(players[0].dataset.userId, jitsiClient);
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
        callback: () => { JitsiBreakout.endAllBreakouts(jitsiClient); },
      },
    );
  }

  static breakout(breakoutRoom, jitsiClient) {
    if (breakoutRoom === jitsiClient.breakoutRoom) {
      // Already in this room, skip
      return;
    }

    log.debug("Switching to breakout room:", breakoutRoom);
    jitsiClient.breakoutRoom = breakoutRoom;
    jitsiClient.jitsiAvClient.connect();
  }

  static startBreakout(userId, breakoutRoom, jitsiClient) {
    if (!game.user.isGM) {
      log.warn("Only a GM can start a breakout conference room");
      return;
    }

    jitsiClient.settings.set("client", `users.${userId}.jitsiBreakoutRoom`, breakoutRoom);
    game.socket.emit(`module.${MODULE_NAME}`, {
      action: "breakout",
      userId,
      breakoutRoom,
    });
  }

  static endUserBreakout(userId, jitsiClient) {
    if (!game.user.isGM) {
      log.warn("Only a GM can end a user's breakout conference");
      return;
    }

    jitsiClient.settings.set("client", `users.${userId}.jitsiBreakoutRoom`, "");
    game.socket.emit(`module.${MODULE_NAME}`, {
      action: "breakout",
      userId,
      breakoutRoom: null,
    });
  }

  static endAllBreakouts(jitsiClient) {
    if (!game.user.isGM) {
      log.warn("Only a GM can end all breakout conference rooms");
      return;
    }

    game.socket.emit(`module.${MODULE_NAME}`, {
      action: "breakout",
      userId: null,
      breakoutRoom: null,
    });

    if (jitsiClient.breakoutRoom) {
      JitsiBreakout.breakout(null, jitsiClient);
    }
  }
}
