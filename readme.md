# Custom raid alert for twitch 
With glitchy terminal effect and text typing.

To make it work:
1. Set CLIENT_ID and CHANNEL in /src/config.js
2. Change TEST_MODE variable in /src/config.js to "false"
3. Serve /src with any local or external HTTP server
4. Add the overlay URL to OBS as browser source
5. On first launch, authorize Twitch with the device code panel
6. ... that's basically it

## Configuration
Use *SHOW_TIME* variable to change how long the raid will be shown (in milliseconds).
Set *TEST_MODE* to true to test it out (automatically calls test raid on page reload and show it for very long time).
CLIENT_SECRET is not used. The overlay uses Twitch Device Code Flow and stores the token in localStorage.

## TODO
- [ ] description how to get keys from twitch

localhost caddy
http://localhost:8088/badge-on-raid/src/index.html?test_channel=fra3a
