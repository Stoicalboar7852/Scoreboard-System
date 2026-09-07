# Kiosk setup — Windows 10 IoT Enterprise LTSC + Microsoft Edge

Each court has one kiosk PC driving a TV. The PC runs Microsoft Edge in kiosk mode pointed at
the scoreboard page for that court. Nothing is installed locally; the page is served by the
scoreboard server over HTTPS.

## 1. Prerequisites

- The server is reachable from the venue network over HTTPS, e.g. `https://scores.example.com`
  (see `docs/DEPLOY.md`). HTTPS is required for the Screen Wake Lock API and the service worker.
- The kiosk PC has Microsoft Edge (Chromium) installed and a local account, e.g. `kiosk`.
- You know the court's scoreboard URL. Either:
  - `https://scores.example.com/scoreboard` — first launch shows a one-time court picker and the
    choice is remembered on that PC (recommended), or
  - `https://scores.example.com/scoreboard/<courtId>` — pinned to a court (copy the id from
    Admin → Courts).

## 2. Windows settings (do these as an administrator)

1. **Power**: Settings → System → Power & sleep → set *Screen* and *Sleep* to **Never** on power.
   Also `powercfg /change monitor-timeout-ac 0` and `powercfg /change standby-timeout-ac 0`.
2. **Display**: set the TV's native resolution (1920×1080 or 3840×2160) and 100% scaling. The page
   scales itself with the viewport, so leave Windows scaling at 100% to avoid blur.
3. **Automatic sign-in**: run `netplwiz`, untick *Users must enter a user name and password*, and
   enter the kiosk account's credentials, so the PC boots straight to the desktop.
4. **Updates**: on LTSC, set active hours to cover match nights (Settings → Windows Update →
   Change active hours) so restarts happen during the day.
5. **Sound** (optional horn): set the TV/HDMI output as the default audio device and unmute.
6. **Scheduled restart** (recommended): Task Scheduler → create a daily task at 04:00 running
   `shutdown /r /t 0` so memory and Edge stay fresh.

## 3. Edge kiosk mode

### Option A — Assigned access (simplest, locks the PC to Edge)

1. Settings → Accounts → Family & other users → **Set up a kiosk** → *Get started*.
2. Create or choose the `kiosk` account, pick **Microsoft Edge**, choose *As a digital sign or
   interactive display*, and enter the scoreboard URL.
3. Set *Restart Edge after idle* to **Never** (an idle timeout would reload the picker page).
4. Sign out; the kiosk account now signs in automatically and runs Edge full screen.

### Option B — Startup shortcut (keeps the desktop available)

Create a shortcut in `shell:startup` for the kiosk account with this target (one line):

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "https://scores.example.com/scoreboard" --edge-kiosk-type=fullscreen --no-first-run --disable-features=TranslateUI --autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble --overscroll-history-navigation=0
```

- `--kiosk … --edge-kiosk-type=fullscreen` — full screen with no UI.
- `--autoplay-policy=no-user-gesture-required` — lets the optional end-of-phase horn play without a
  click (Sound can be switched on in Admin → Settings).
- `--disable-session-crashed-bubble` — no "restore pages" bar after a power cut.

## 4. What the page does on its own

- Hides the mouse cursor, requests full screen and a wake lock, and keeps the screen awake.
- Reconnects automatically after Wi-Fi drops; the clock keeps counting from the last known state
  and snaps to the server on reconnect. A small dot in the top-right corner shows connection
  status (green = connected, amber = reconnecting, red = offline).
- Reloads itself a few seconds after a new version of the app is deployed.
- Shows the idle screen (next game / court name) whenever the court has no live game.

## 5. Re-pointing a kiosk to another court

Press and hold anywhere on the screen for two seconds (mouse or touch) to reopen the court
picker, or open `https://scores.example.com/scoreboard?pick=1`.

## 6. Troubleshooting

| Symptom | Check |
|---------|-------|
| Blank white page | The server URL is wrong or HTTPS certificate is untrusted. Open the URL in a normal Edge window once and accept/inspect the certificate. |
| Clock drifts or "slow" badge | Round-trip time above 2 s; check the Wi-Fi link for the kiosk PC. Displays re-sync every 60 s. |
| No horn | Sound is off in Admin → Settings, the HDMI audio device is not default, or Edge was launched without `--autoplay-policy=no-user-gesture-required` (Option B) / the page has never been clicked (any click or key press unlocks audio). |
| Screen goes to sleep | Power settings (section 2) or a group policy is overriding them. |
| Wrong court | See section 5. |
