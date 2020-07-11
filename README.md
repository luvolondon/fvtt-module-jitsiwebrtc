# Jitsiwebrtc
Replacement for the easyrtc p2p client to use a Jitsi relay server for A/V. It has the main advantage of being able to run all communication via a relay server. A player only needs to send her/his A/V stream to a single receiver, where it is distributed to all other players. If you have more then 2 players, this is a bandwidth improvement. This feature is called SFU (Selective Forwarding Unit). Read more about Jitsi on https://jitsi.org/.

First tests with 4-5 players resulted in ~700Kbit/s upload and ~ 1Mbit/s download rate for each player.

This is a first version to test the integration into FVTT. Have a look at the Issues list for the not yet working features.

Caution:
Atm the Jitsi Meet lib only works ok if all users are running a Chromium based browser. A solution to add Firefox and Safari to the supported browsers has been announced for April 2020. See https://github.com/jitsi/jitsi-meet/issues/4758 for current progress. Update: With version 0.2.9 a new version of the API lib is included. This should help with problems on FF and Safari.

# Installation
You can install this module by using the following manifest URL : https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/master/module.json

# How to use
To use this client you have to enable A/V in the Game settings. The module will replace the easyrtc client of vanilla FVTT.
You can either connect via the Jitsi server by leaving the Signalling Server on "Foundry VTT". Or switch to a custom, self-hosted Jitsi server. A great documentation by @solfolango77 for installing your own server can be found here: https://www.vttassets.com/articles/installing-a-self-hosted-jitsi-server-to-use-with-foundry-vtt

	
The video stream is configured for a resolution of 240 pixels height. This could later be part of GUI configuration settings.

# Changelog

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
Fix by @bekit to detect failed local streams. thx!
see https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/10

v0.2.22
Multiple fixes by @bekit, thx!
see https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/15

v0.2.27
Updated compatibleCoreVersion to 0.6.4, copied files from linting-cleanup branch created by @bekit (thx!)

v0.2.28 
Another great addition to the module be @bekit, now users that directly connect to the Jitsi server are added to the game as temporary A/V users. Very handy for players without A/V on the desktop who need to usse their mobile phone for A/V.

# License
This Foundry VTT module, written by Luvolondon, is licensed under a Creative Commons Attribution 4.0 International License.

