<img src="public/icons/icon.svg" width="64" height="64" alt="">

# PictureSlide

A photo puzzle for small kids (about 3–8). Pick a picture, choose 4 / 9 / 16 / 25 pieces, watch it
scramble, then put it back together by **dragging** pieces or **tap-tap** swapping them.

It's an installable web app (PWA): it runs in the browser, can be added to the home screen to open
full-screen, and works offline once loaded.

## How it plays

- **Gallery.** Built-in starter pictures plus any photos a grown-up adds with **Add photos**, which
  opens the device's photo picker. Photos are centre-cropped to a square, shrunk, and stored on the
  device in IndexedDB. Nothing is uploaded anywhere.
- **Grown-up edit mode.** Press and hold the pencil button to show delete buttons on photos.
- **Puzzle.**
  - The whole picture is shown first, then it shuffles so no piece starts in its right place.
  - A piece that lands in its right spot locks in place, flashes, sparkles, and plays the next note
    of a rising scale.
  - Press and hold the little picture to peek at the finished image.
- **Win.** The picture joins up seamlessly, with a fanfare and confetti. Then the child can play
  again, try more pieces, or go back to the gallery.
- **Sound.** All sounds are made in code with Web Audio; there are no audio files. Android phones
  vibrate too; iOS doesn't support vibration from the web.

## Development

```bash
npm install
npm run dev        # Vite dev server on :5173, also reachable from other devices on the network
npm run typecheck
npm run build      # production build + service worker in dist/
npm run preview    # serve the production build
npm run icons      # rebuild PNG icons from public/icons/icon.svg (needs rsvg-convert + magick)
```

### Testing on real devices

Some browser features, including the service worker, wake lock and install prompt, only work over
HTTPS or on `localhost`. A plain `http://192.168.x.x:5173` address is fine for trying the game, but
those features will be missing.

- **Android over USB (best for quick iteration).** Turn on USB debugging, plug in, then:
  ```bash
  npm run android    # = adb reverse tcp:5173 tcp:5173 && vite
  ```
  Open `http://localhost:5173` in Chrome on the phone. Changes reload live. To debug, open
  `chrome://inspect` on the desktop for the phone's DevTools. Needs `adb` (`android-tools` package).
- **Any device on the tailnet, including the iPad (real HTTPS).** Run
  `tailscale serve --bg --https=10000 5173` alongside `npm run dev`. Then open
  `https://<this-machine>.<tailnet>.ts.net:10000` on the tablet. Stop it with
  `tailscale serve --https=10000 off`. (Using its own port avoids replacing anything already served
  on 443; `tailscale serve reset` would remove every mapping.)
  Safari Web Inspector for the iPad needs a Mac (`scar` or `spin`).
- **Desktop.** Chrome DevTools device mode with touch emulation covers most layout work.

To install on a device: in Chrome on Android, use the menu → *Add to Home screen*; in Safari on
iPad, use Share → *Add to Home Screen*. For a kid-proof session, use Android *App pinning* or iPad
*Guided Access*.

## Code map

| File | What it does |
| --- | --- |
| `src/main.ts` | Screens (gallery, difficulty sheet, game, win), routing, global input handling |
| `src/board.ts` | Puzzle board: spring physics, drag + tap-tap gestures, swapping, locking, win |
| `src/audio.ts` | Synthesised sound effects (Web Audio) |
| `src/fx.ts` | Canvas sparkles and confetti |
| `src/importPhoto.ts` | Photo picker, decode, square crop and downscale |
| `src/storage.ts` | IndexedDB storage for imported photos |
| `src/haptics.ts` | Vibration patterns (Android) |
| `public/starters/` | Built-in starter pictures (SVG) |
