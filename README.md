# Disney+ Episode Guard v1.1.0

An independent, experimental Chrome/Chromium extension to prevent Disney+ from unexpectedly switching to the next episode **before the current episode ends**, including cases where Disney+ profile **Autoplay = Off** has no effect.

This release is **not tested against a logged-in Disney+ player**, and cannot guarantee that it stops the problem. Disney+ sometimes transitions between episodes entirely inside its player, without a URL change or a Next Episode popup.

## Upgrade / install

1. Extract `disneyplus-episode-guard-v1.1.0.zip` into a permanent folder.
2. Open `chrome://extensions`, enable Developer mode.
3. **Remove or turn off Episode Guard v1.0.0 first** so it does not run at the same time. Keep the separate **Disney+ Link Redirector** enabled if needed; it is a different extension.
4. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Refresh the Disney+ tab before trying the episode again.
6. From the Episode Guard popup, enable **Protection** and **Protect active video source** (on by default).

## What changed in v1.1.0

- Added interception of `video.src`, `video.srcObject`, `setAttribute('src')`, and `removeAttribute('src')` for an *already playing* video while it has not ended.
- Detects suspicious timeline resets, metadata changes, and video-element replacement to help diagnose internal player episode changes.
- Retains recent progress/source information if the site clears the video element before changing its source.
- Maintains the earlier automatic navigation / programmatic Next Episode click guard.
- Includes **Copy diagnostic report** in the popup. Diagnostics are kept locally and contain only event types, relative video time/duration, and timestamps; no content URLs, profile data, media streams, or account credentials are recorded.

## Settings

- **Protection enabled:** Turns both protections on or off.
- **When to block:** `Always: next episode is manual` (default) or `Only until the current video ends`.
- **Protect active video source:** Aggressive experimental feature (default on). If Disney+ playback freezes, buffers indefinitely, or shows an error, turn this off. Some player recovery actions legitimately replace the source.
- **Allow next switch for 15 seconds:** Temporarily allows a programmatic episode transition if the manual button does not work.
- **Copy diagnostic report:** After observing a failure, copy the report and share it with the maintainer for targeted debugging. It contains only safe video lifecycle telemetry, not complete URLs.

## How the guard works and known gaps

The extension runs at `document_start` in Chrome's `MAIN` world on disneyplus.com.

- In the initial page version, the only attempted protections were route changes and synthetic Next Episode clicks. Neither can catch a transition entirely within an already-open media player.
- This version also watches the HTML5 video element and rejects some unwanted source swaps while an unfinished episode has been playing.
- A streaming player may instead reuse the *same MediaSource* or replace media elements without touching those setters. The browser cannot reliably recognize the episode identity from standard HTMLVideoElement properties. Such cases may still bypass the guard.
- It does **not** intercept or alter streaming requests, DRM sessions, protected media, or license checks. It cannot force Disney+'s internal software to keep playing a video if Disney+ ends it via proprietary logic.
- The strict feature could block a legitimate player recovery. Disable that feature if playback breaks.

All storage is local to your browser. No telemetry is uploaded. No media is downloaded or recorded. This is unofficial and is not affiliated with Disney.

## Testing

```bash
node tests/guard.test.cjs
```

15 simulated tests cover route navigation, manual vs synthetic clicks, source changes, optional mode, and media-reset behavior. They do not simulate Disney+'s proprietary playback engine.

## Version history

- v1.1.0 — November 13, 2026 — Media source protection and diagnostic report.
- v1.0.0 — November 13, 2026 — Early navigation guard.
