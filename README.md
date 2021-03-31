# Jitsi WebRTC client
Replacement for the easyrtc p2p client to use a Jitsi relay server for A/V. It has the main advantage of being able to run all communication via a relay server. A player only needs to send her/his A/V stream to a single receiver, where it is distributed to all other players. If you have more then 2 players, this is a bandwidth improvement. This feature is called SFU (Selective Forwarding Unit). Read more about Jitsi on https://jitsi.org/.

First tests with 4-5 players resulted in ~700Kbit/s upload and ~ 1Mbit/s download rate for each player.

## Installation
You can install this module by using the following manifest URL: https://github.com/luvolondon/fvtt-module-jitsiwebrtc/releases/latest/download/module.json

## How to use
To use this client you have to enable A/V in the Game settings. The module will replace the easyrtc client of vanilla FVTT.
You can either connect via the Jitsi server by leaving the Signalling Server on "Foundry VTT". Or switch to a custom, self-hosted Jitsi server. A great documentation by @solfolango77 for installing your own server can be found here: https://www.vttassets.com/articles/installing-a-self-hosted-jitsi-server-to-use-with-foundry-vtt

You can allow standalone Jitsi users to join your conference by enabling the module setting `Allow standalone Jitsi users`. When enabled, users can see the Jitsi meeting URL under the read-only module setting `Standalone Jitsi URL`.

### **Breakout Rooms**
A GM can now split the party!

To start a breakout room, right-click on the player you would like to break out in the player list and select `Start A/V breakout`. You will join a different A/V session with that user. You can now click on other users and pull them into the breakout room, or start yet another breakout room with another user.

![start breakout example](https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/main/images/example_start-breakout.png)

Though the GM will always join the breakout room on creation, they can leave the breakout room themselves by right-clicking on their own username and selecting `Leave A/V Breakout`. Users can also leave a breakout at any time by right-clicking on their own name, and the GM can end all breakout rooms by selecting `End all A/V breakouts`.

![start breakout example](https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/main/images/example_end-breakout.png)

## Debugging
By default, debug logs are disabled. If additional logs are needed for troubleshooting please run the following in the console: `game.settings.set('jitsirtc', 'debug', true);`

## Important
If you test your own Jitsi server with two users, the standard setup will connect these users in a Peer-to-peer way without using the Jitsi bridge. This switches if a third user connects. This module _always_ initiates a Jitsi connection in bridge mode and even with two players never does peer2peer. Keep this in mind when testing.

Thx to this addition by [@bekriebel](https://github.com/bekriebel)

https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/19
users can now join the A/V part by directly connecting to the Jitsi server. These users show up as temporary extra users in-game.
	
The video stream is configured for a resolution of 240 pixels height. This could later be part of GUI configuration settings.

## Changelog
See [CHANGELOG](/CHANGELOG.md)

# License
This Foundry VTT module is licensed under a Creative Commons Attribution 4.0 International License.
