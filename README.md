# fvtt-module-jitsiwebrtc
Replacement for the easyrtc p2p client to use a Jitsi relay server for A/V. It has the main advantage of being able to run all communication via a relay server. A player only needs to send his A/V stream to a single receiver, where it is distributed to all other players. If you have more then 3-4 players, this is a bandwidth improvement. This feature is called SFU (Selective Forwarding Unit). Read more about Jitsi on https://jitsi.org/.

This is a first version to test the integration into FVTT. It is working, several features like user blocking, detecting streams going offline etc. are not implemented yet.

# Installation
You can install this module by using the following manifest URL : https://raw.githubusercontent.com/luvolondon/fvtt-module-jitsiwebrtc/master/module.json

# How to use
To use this client you have to enable A/V in the Game settings. The module will replace the easyrtc client of vanilla FVTT.
You can either connect via the Jitsi server by leaving the Signalling Server on "Foundry VTT". Or switch to a custom, self-hosted Jitsi server. You have to enter the hostname of the server (e.g. "myvideo.example.com) as the "Signalling Server URL" and enter authentication credentials if you have a secure domain configured on the server. 
The Relay Server Configuration part is not used.
The hostname entry generates this connection profile for your Jitsi server, so make sure you have all the names registered:
```javascript
this._options = {
			hosts: {
				domain: server["url"],
				muc: 'conference.' + server["url"],
				focus: 'focus.' + server["url"]
			},
			bosh: '//' + server["url"] + '/http-bind',
			clientNode: 'http://jitsi.org/jitsimeet',
			
		};
```
The video stream is configured for a resolution of 240 pixels height. This could later be part of GUI configuration settings.

# Changelog

v0.1
Initial release to test the integration with the FVTT API and call handling. 

# License
This Foundry VTT module, writen by Luvolondon, is licensed under a Creative Commons Attribution 4.0 International License.

