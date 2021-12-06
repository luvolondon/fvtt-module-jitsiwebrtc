# Jitsi WebRTC client

Replacement for the EasyRTC p2p client to use a Jitsi relay server for A/V. It has the main advantage of being able to run all communication via a relay server. A player only needs to send her/his A/V stream to a single receiver, where it is distributed to all other players. If you have more then 2 players, this is a bandwidth improvement. This feature is called SFU (Selective Forwarding Unit). Read more about Jitsi on https://jitsi.org/.

First tests with 4-5 players resulted in ~700kbit/s upload and ~ 1Mbit/s download rate for each player.

<a name="user-limit-warning"></a>

> | :warning: [Limit of 5 users when using the default Public Jitsi Meet server](https://github.com/luvolondon/fvtt-module-jitsiwebrtc/issues/92) |
> | --------------------------------------------------------------------------------------------------------------------------------------------- |
>
> Starting early December, 2021, Jitsi has added a setting to their beta public Jitsi Meet server which limits the number of users who can send video to 5.
>
> You can attempt to get around this by setting your Jitsi server choice to `Custom Server` and using the Server Address `meet.jit.si` with no Username or Password. However, many users previously reported connection issues with using the non-beta version of the public Jitsi Meet server. It is also possible that the 5-user limit will be implemented on this server in the future. You can also run your own private Jitsi Meet server and configure the limit to a value that works for you.
>
> However, I highly suggest instead switching to the newer [LiveKit AVClient](https://foundryvtt.com/packages/avclient-livekit) module. I have found LiveKit to be a much more stable A/V platform to work with and the server much easier to run. There are currently no free public LiveKit servers. There are links on the module page to guides on running your own server, and I (bekit) also provide a highly available cluster of LiveKit servers with nodes in multiple parts of the world. To cover my expenses, this cluster is only available to subscribers of [my Patreon](https://www.patreon.com/bePatron?u=5662939).
>
> Due to ongoing issues both developing and using the Jitsi module, I will no longer be actively developing it. I will continue to make minor adjustments and bug fixes, but this module may soon enter a deprecated state unless another developer would like to take over work on it.

## Installation

You can install this module by using the following manifest URL: https://github.com/luvolondon/fvtt-module-jitsiwebrtc/releases/latest/download/module.json

## How to use

To use this client you have to enable A/V in the Game settings. The module will replace the EasyRTC client of vanilla FVTT.
You can either connect via the Jitsi server by leaving the Signalling Server on "Foundry VTT". Or switch to a custom, self-hosted Jitsi server. A great documentation by @solfolango77 for installing your own server can be found here: [VTTA - Installing a self-hosted Jitsi Server for Foundry VTT](https://vtta.io/articles/installing-a-self-hosted-jitsi-server).

You can allow standalone Jitsi users to join your conference by enabling the module setting `Allow standalone Jitsi users`. When enabled, users can see the Jitsi meeting URL under the read-only module setting `Standalone Jitsi URL`.

### **Breakout Rooms**

A GM can now split the party!

To start a breakout room, right-click on the player you would like to break out in the player list and select `Start A/V breakout`. You will join a different A/V session with that user. You can now click on other users and pull them into the breakout room, or start yet another breakout room with another user.

![start breakout example](https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/main/images/example_start-breakout.png)

Though the GM will always join the breakout room on creation, they can leave the breakout room themselves by right-clicking on their own username and selecting `Leave A/V Breakout`. Users can also leave a breakout at any time by right-clicking on their own name, and the GM can end all breakout rooms by selecting `End all A/V breakouts`.

![start breakout example](https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/main/images/example_end-breakout.png)

### **Live Captions / Subtitles**

Automated live captioning is supported by this module using Jitsi's Jigasi subtitle/transcription functionality. This requires that your Jitsi server be configured to support transcription through the Jigasi service. Unfortunately, the public Jitsi Meet servers do not provide this functionality. To enable this on your own self-hosted service, see the Jigasi documentation: [Using Jigasi to transcribe a Jitsi Meet conference](https://github.com/jitsi/jigasi#using-jigasi-to-transcribe-a-jitsi-meet-conference).

![animated image of foundry vtt live caption example](https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/main/images/example-jitsi_captions.webp)

## Debugging

By default, debug logs are disabled. If additional logs are needed for troubleshooting, `Enable debug logging` can be turned on under the module settings.

## Changelog

See [CHANGELOG](/CHANGELOG.md)

## Support my work

[![Become a Patron](https://img.shields.io/badge/support-patreon-orange.svg?logo=patreon)](https://www.patreon.com/bekit)
[![Donate via Ko-Fi](https://img.shields.io/badge/donate-ko--fi-red.svg?logo=ko-fi)](https://ko-fi.com/bekit)

# License

This Foundry VTT module is licensed under a Creative Commons Attribution 4.0 International License.
