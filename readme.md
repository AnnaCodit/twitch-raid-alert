# Custom raid alert for twitch 
With glitchy terminal effect and text typing.

To make it work:
1. Change CHANNEL variable in /release/config.js to your channel name
2. Change TEST_MODE variable in /release/config.js to "false"
3. Add /release/index.html to your obs as browser source
4. Copy /secrets/secret-example.js to /secrets/secret.js and fill it with your data
5. ... that's basically it

## Configuration
Use *SHOW_TIME* variable to change how long the raid will be shown (in milliseconds).
Set *TEST_MODE* to true to test it out (automatically calls test raid on page reload and show it for very long time).

## TODO
- [ ] description how to get keys from twitch