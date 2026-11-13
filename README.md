# Disney+ Episode Guard

Experimental, unofficial Chrome/Chromium extension that attempts to prevent premature Disney+ next-episode changes. No DRM/network interception, tracking, or media downloading.

## Version 1.5.0

- Adds an **Exit player** fallback button near the end of playback or when a recognized Next Episode prompt appears. This is a deliberate navigation action separate from Disney+'s potentially unresponsive player Back/Exit control. It returns to the last same-origin browsing page if known, or to the Disney+ home page.
- Stops intercepting `pointerdown` on popup controls. This should avoid suppressing native Back/Exit input.
- Avoids blocking top-left X/Close buttons, which can represent the **player Back control** rather than the Next Episode popup dismiss button.
- Keeps the conservative v1.4 popup-dismiss protection (only when a small, distinct Next Episode popup can be identified) and the scripted Next Episode click check.
- Never blocks `history.pushState`/`replaceState`, video media sources, rewind, keyboard input, or the native player Back/Exit navigation.
- Adds the **Show Exit Player near credits** setting (enabled by default).

### Known limitations

- This is not a verified fix for Disney+'s internal episode transition logic. The popup workaround is based on a [user report](https://bugzilla.mozilla.org/show_bug.cgi?id=2069771) that leaving the popup open stopped a premature skip.
- The fallback Exit button is a workaround, **not** a repair of Disney+'s Back button. It is visible only when nearing the end of the video or a recognized Next Episode popup appears; it may be hidden by browser fullscreen or unknown Disney+ UI variants.
- The extension has not been tested in a signed-in Disney+ streaming session. Automated tests cover simulated browser/player behavior only.
- A default home URL may differ between locales. The Exit button will prefer the last known Disney+ browsing page whenever possible.

## Install / update

1. Use the v1.5.0 ZIP or clone this repository. Extract into a permanent folder.
2. Open `chrome://extensions`, enable Developer mode, and **disable/remove older Episode Guard versions**.
3. Click **Load unpacked** and select the folder with `manifest.json`, or reload an existing unpacked installation after replacing the files.
4. Refresh your Disney+ tab.

## Settings

- **Protection enabled**: overall enable/disable.
- **Keep Next Episode popup open**: block clicks on a safely recognized Next Episode popup's Close/Dismiss button, not the player Back button.
- **Show Exit Player near credits**: display a small fallback button when the video is almost over or a next-episode prompt is identified.
- **Block scripted Next Episode clicks**: restrict untrusted programmatic clicks on Next Episode controls.
- **When to block**: always or only until the HTML video reports `ended` (applies to scripted clicks, not Disney+ internal transitions).
- **Copy diagnostic report**: copies locally recorded playback events and timestamps; no URLs, streaming data, account identifiers or tokens.

## Development

```bash
node --check page-guard.js
node --check bridge.js
node --check popup.js
node tests/guard.test.cjs
```

The MIT license applies. This project is not affiliated with Disney.
