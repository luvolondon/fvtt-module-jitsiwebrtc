# Jitsiwebrtc
Replacement for the easyrtc p2p client to use a Jitsi relay server for A/V. It has the main advantage of being able to run all communication via a relay server. A player only needs to send her/his A/V stream to a single receiver, where it is distributed to all other players. If you have more then 2 players, this is a bandwidth improvement. This feature is called SFU (Selective Forwarding Unit). Read more about Jitsi on https://jitsi.org/.

First tests with 4-5 players resulted in ~700Kbit/s upload and ~ 1Mbit/s download rate for each player.

## Installation
You can install this module by using the following manifest URL : https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/master/module.json

## How to use
To use this client you have to enable A/V in the Game settings. The module will replace the easyrtc client of vanilla FVTT.
You can either connect via the Jitsi server by leaving the Signalling Server on "Foundry VTT". Or switch to a custom, self-hosted Jitsi server. A great documentation by @solfolango77 for installing your own server can be found here: https://www.vttassets.com/articles/installing-a-self-hosted-jitsi-server-to-use-with-foundry-vtt

You can allow standalone Jitsi users to join your conference by enabling the module setting `Allow standalone Jitsi users`. When enabled, users can see the Jitsi meeting URL under the read-only module setting `Standalone Jitsi URL`.

## Debugging
By default, debug logs are disabled. If additional logs are needed for troubleshooting please run the following in the console: `game.settings.set('jitsirtc', 'debug', true);`

## Important
If you test your own Jitsi server with two users, the standard setup will connect these users in a Peer-to-peer way without using the Jitsi bridge. This switches if a third user connects. This module _always_ initiates a Jitsi connection in bridge mode and even with two players never does peer2peer. Keep this in mind when testing.

Thx to this addition by [@bekriebel](https://github.com/bekriebel)

https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/19
users can now join the A/V part by directly connecting to the Jitsi server. These users show up as temporary extra users in-game.
	
The video stream is configured for a resolution of 240 pixels height. This could later be part of GUI configuration settings.

## Changelog

v0.1
Initial release to test the integration with the FVTT API and call handling. 

v0.1.1
Bugs with device detection fixed. 

v0.2
Several fixes for working audio. Chrome works great, Firefox has issues when players reconnect etc.

v0.2.1 - v.0.2.6 Several fixes for acting dynamically on incoming A/V tracks, now with Audio-only, Video-only

v0.2.9 
Updated the included Jitsi Meet API Lib

v0.2.10
Included changes from @bekit to improve resolution selection

v0.2.11
Cleanup of variables for book-keeping of local and remote tracks. Now user-blocking of audio and video is possible. More robust against reloads/changes coming from the clients.

v0.2.17
Fix by [@bekriebel](https://github.com/bekriebel) to detect failed local streams. thx!
see https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/10

v0.2.22
Multiple fixes by [@bekriebel](https://github.com/bekriebel), thx!
see https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/15

v0.2.27
Updated compatibleCoreVersion to 0.6.4, copied files from linting-cleanup branch created by [@bekriebel](https://github.com/bekriebel) (thx!)

v0.2.28 
Another great addition to the module be [@bekriebel](https://github.com/bekriebel), now users that directly connect to the Jitsi server are added to the game as temporary A/V users. Very handy for players without A/V on the desktop who need to usse their mobile phone for A/V.

v0.3.0
Major refactor of the code to better align with FoundryVTT expectations. This should hopefully improve stability and debugging of the module. With this version, @bekriebel (bekit on Discord) has taken over as the primary module owner. Thank you to [@Luvolondon](https://github.com/luvolondon) for the original module work and future efforts with maintaining it!
* Fix game settings registration so module settings appear properly under the module name. *NOTE*: Because the settings namespace changed, any previously configured settings will be reset with this version.
* Only use custom URLs when the `Use custom Jitsi URLs` option is enabled. The custom URL settings will be visible after enabling this feature.
* Update lib-jitsi-meet to the latest released version.
* Don't force debugging to always be on. See the Debugging section above on how to enable debug logs.
* Major refactor of code to better align with FoundryVTT expectations.
* Kick non-FVTT users out of the meeting if the `Allow standalone Jitsi users` is not enabled.
* Allow the audio output device to be changed.
* Switch back to the non-beta Jitsi Meet server by default. The beta server is not as well maintained. If you would like to continue using the beta server, it can be configured as a custom server.

v0.3.1
Switch back to the `beta.meet.jit.si` server as the default. It seems some people have issues connecting to the production server. [Jitsi Comunity thread](https://community.jitsi.org/t/connection-failed-using-lib-jitsi-meet/20774) on the issue.

v0.3.2
If no meeting room name is set, create a random name. Not having a name set was causing the module to not work on a freshly created world that never had the room name generated.

v0.3.3
* Fix an issue where multiple users connecting to a load-balanced Jitsi instance (like the default Jitsi Meet servers) may get put on different instances of the conference and not see each other.
* When setting custom URLs, also populate with default server information if no custom server is entered.

# License
This Foundry VTT module, written by Luvolondon, is licensed under a Creative Commons Attribution 4.0 International License.
