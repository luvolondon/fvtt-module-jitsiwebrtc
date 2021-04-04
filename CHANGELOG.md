# v0.5.5
* Fix error on older Jitsi versions that don't have the setReceiverConstraints method

# v0.5.4
* Set new constraint values to fix framerate on beta.meet.jit.si
* Minor spelling fixes

# v0.5.3
* Update Spanish translation (thanks to José E. Lozano!)
* Fix some changelog typos
* Improve breakout room setting storage
* Update compatibility to FVTT v0.8.1

# v0.5.2
* Render the player list after setting a user to active
* Add an option under Module Settings to reset the Jitsi Room ID

# v0.5.1
* Update Spanish translation (thanks to José E. Lozano!)

# v0.5.0
* Split the party! You can now create breakout rooms for separate chats between users. See [Breakout Rooms](/README.md#breakout-rooms) in the README for more details
* Switch to a Dialog for the Use Full Jitsi Meet join message to better support v0.8.0
* Disable the Jitsi pre-join page when joining with the Full Jitsi Meet option

# v0.4.19
* Fix deletion of temporary external users

# v0.4.18
* Fix external users on FVTT v0.8.0
* Update compatibility to FVTT v0.8.0

# v0.4.17
* Update simulcast and resolution settings for consistent video

# v0.4.16
* Add some additional logging around connection states to attempt to track down camera freezing issues

# v0.4.15
* Don't attempt to set the audio output device when that option isn't available (such as with the FireFox browser)

# v0.4.14
* Improve track add logic
* Improve changelog

# v0.4.13
* Minor changes to a/v track sharing
* Add non-user-facing method for sharing screen/desktop into the meeting

    This is mostly for testing and there are no plans to add a UI for it, however it can be used in a macro by running `game.webrtc.client._shareDesktopTracks();` and normal a/v tracks can be resumed by running `game.webrtc.client._initializeLocal(game.webrtc.client.settings.client);`

# v0.4.12
* Improve logic around creating local a/v tracks to better handle when audio or video may not be available or enabled

# v0.4.11
* Fix a potential crash when the conference hasn't been loaded properly
* Set the sending video constraint resolution for Jitsi servers that may not work when this isn't set

# v0.4.10
* Force users to active when joining with Jitsi to make connections more reliable
* Add warning log function and clean up logging

# v0.4.9
* Handle audio/video elements through our module instead of relying on FVTT
* Switch primary branch to `main`
* Move `jitsirtc.js` into a scripts folder and remove deprecated `lib-jitsi-meet.min.js`
* Add GitHub workflow for automated release process
* Update compatibility to FVTT v0.7.9

# v0.4.8
* Prevent throwing an error when disconnect is called
* Allow setting the audio output device
* Don't do a full page reload when changing settings

# v0.4.7
* Add Spanish translation thanks to José E. Lozano
* Update jitsi config settings for more consistency and performance

# v0.4.6
* Update compatibility to FVTT v0.7.7
* Fix custom server URL settings
* Add localization options (English only for now)
* Show that the default server is using `beta.meet.jit.si`

# v0.4.5
* Call renders more often, but with a debounce delay

# v0.4.4
* Pass config object with initializing to enable additional performance settings
* Only block the toggling of audio off of mute when PTT is set
* Blank out the video track when the remote user is hidden
* Remove the voice activation option as this is natively handled by Jitsi
* Port the "Use full Jitsi Meet client" from WebRTCTweaks

# v0.4.3
* Properly handle the URL between custom and default ("FVTT") server selection
* Properly handle missing audio and video devices
* Set voice-activation mode to act the same as always-on. Since Jitsi handles voice activation natively, there is no need to handle this differently.
* Update the values read from config.js with better defaults
* Reduce the number of render calls to hopefully make UI updates work better

# v0.4.2
* Dynamically jitsi library and config from server. This will hopefully make connections more reliable.
* Remove support for FVTT versions lower than v0.7.2

# v0.4.1
* Update lib-jitsi-meet to latest version from beta.meet.jit.si. This will hopefully resolve some of the connection issues.

# v0.4.0
* Update to support FVTT 0.7.2 and above
* Update lib-jitsi-meet to latest library version
* This is a major refactor of the code base and may still contain bugs. Please submit issues that are found.

# v0.3.4
* Use Jitsi's API for attaching local video to the video window. This should fix the freezing of local video windows.

# v0.3.3
* Fix an issue where multiple users connecting to a load-balanced Jitsi instance (like the default Jitsi Meet servers) may get put on different instances of the conference and not see each other.
* When setting custom URLs, also populate with default server information if no custom server is entered.

# v0.3.2
* If no meeting room name is set, create a random name. Not having a name set was causing the module to not work on a freshly created world that never had the room name generated.

# v0.3.1
* Switch back to the `beta.meet.jit.si` server as the default. It seems some people have issues connecting to the production server. [Jitsi Community thread](https://community.jitsi.org/t/connection-failed-using-lib-jitsi-meet/20774) on the issue.

# v0.3.0
Major refactor of the code to better align with FoundryVTT expectations. This should hopefully improve stability and debugging of the module. With this version, @bekriebel (bekit on Discord) has taken over as the primary module owner. Thank you to [@Luvolondon](https://github.com/luvolondon) for the original module work and future efforts with maintaining it!
* Fix game settings registration so module settings appear properly under the module name. *NOTE*: Because the settings namespace changed, any previously configured settings will be reset with this version.
* Only use custom URLs when the `Use custom Jitsi URLs` option is enabled. The custom URL settings will be visible after enabling this feature.
* Update lib-jitsi-meet to the latest released version.
* Don't force debugging to always be on. See the Debugging section above on how to enable debug logs.
* Major refactor of code to better align with FoundryVTT expectations.
* Kick non-FVTT users out of the meeting if the `Allow standalone Jitsi users` is not enabled.
* Allow the audio output device to be changed.
* Switch back to the non-beta Jitsi Meet server by default. The beta server is not as well maintained. If you would like to continue using the beta server, it can be configured as a custom server.

# v0.2.28
* Another great addition to the module be [@bekriebel](https://github.com/bekriebel), now users that directly connect to the Jitsi server are added to the game as temporary A/V users. Very handy for players without A/V on the desktop who need to use their mobile phone for A/V.

# v0.2.27
* Updated compatibleCoreVersion to 0.6.4, copied files from linting-cleanup branch created by [@bekriebel](https://github.com/bekriebel) (thx!)

# v0.2.22
* Multiple fixes by [@bekriebel](https://github.com/bekriebel), thx!
    see https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/15

# v0.2.17
* Fix by [@bekriebel](https://github.com/bekriebel) to detect failed local streams. thx!
    see https://github.com/luvolondon/fvtt-module-jitsiwebrtc/pull/10

# v0.2.11
* Cleanup of variables for book-keeping of local and remote tracks. Now user-blocking of audio and video is possible. More robust against reloads/changes coming from the clients.

# v0.2.10
* Included changes from @bekit to improve resolution selection

# v0.2.9
* Updated the included Jitsi Meet API Lib

# v0.2.1 - v.0.2.6
* Several fixes for acting dynamically on incoming A/V tracks, now with Audio-only, Video-only

# v0.2
* Several fixes for working audio. Chrome works great, Firefox has issues when players reconnect etc.

# v0.1.1
* Bugs with device detection fixed.

# v0.1
* Initial release to test the integration with the FVTT API and call handling.
