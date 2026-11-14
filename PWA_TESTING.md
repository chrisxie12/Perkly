# PWA testing

This file records how the Perqly PWA is tested and the **actual** results. A test is only marked passed when it was really run. Device tests stay **Pending** until someone runs them on a real phone.

Labels: **Automated check passed** · **Manually tested** · **Pending (needs a device)**

## Results: Phase 0, Step 1 (2026-11-14)

Environment: production build (`npm run build && npm run start`) on `http://localhost:3100`, checked with headless Google Chrome (puppeteer-core) and Lighthouse. Browsers treat `localhost` as a secure context, so the service worker registers without HTTPS.

| Check                                                                  | Result                       | How                                                                                                                                              |
| ---------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manifest loads and parses                                              | Automated check passed       | `fetch('/manifest.webmanifest')`: name "Perqly", display "standalone", start_url "/student", 3 icons                                             |
| Icons load                                                             | Automated check passed       | 192, 512, maskable 512 and Apple touch 180 all return 200                                                                                        |
| Service worker registers and controls the page                         | Automated check passed       | `navigator.serviceWorker.ready`; scope `/`; page controlled                                                                                      |
| Service worker served uncached                                         | Automated check passed       | `/serwist/sw.js` has `Cache-Control: no-cache, no-store, must-revalidate`                                                                        |
| Offline page is precached                                              | Automated check passed       | `/offline` found in the Serwist precache                                                                                                         |
| Private areas never cached                                             | Automated check passed       | Visited `/student` and `/admin` online, then inspected Cache Storage: no entries under `/student`, `/merchant`, `/institution`, `/admin`, `/api` |
| Offline fallback for private areas                                     | Automated check passed       | Stopped the server, then navigated: `/student` and `/admin` showed "You're offline."                                                             |
| Public pages work offline after a visit                                | Automated check passed       | Server stopped: `/` and `/install` rendered from cache                                                                                           |
| No reload on first install                                             | Automated check passed       | Lighthouse "redirects" audit passes (an earlier version reloaded when the SW took control; fixed)                                                |
| Lighthouse (mobile, home page)                                         | Automated check passed       | 3 runs: Performance 94 / 87 / 91, Accessibility 100, Best Practices 100, SEO 100 (median Performance 91)                                         |
| No horizontal overflow at 360 / 390 px                                 | Automated check passed       | `document.documentElement.scrollWidth` equals the viewport width                                                                                 |
| Android Chrome: install prompt, home-screen icon, standalone launch    | **Pending (needs a device)** | See procedure below                                                                                                                              |
| iPhone Safari: Add to Home Screen, icon, standalone launch, safe areas | **Pending (needs a device)** | See procedure below                                                                                                                              |
| Update prompt on a real redeploy                                       | **Pending**                  | Deploy twice to a Vercel preview and confirm the "new version" message appears                                                                   |

## How to test on real phones

You need an **HTTPS** URL. The easiest is a Vercel preview deployment of your branch.

### Android (Chrome)

1. Open the preview URL in Chrome.
2. Check the ⋮ menu shows **Install app** (or _Add to Home screen_). Install it.
3. Confirm the Perqly icon (blue square, white "p", orange dot) is on the home screen and isn't cropped badly (maskable icon).
4. Open it from the home screen: it must open **full-screen without the browser address bar**, and the status bar should be Perqly blue.
5. Turn on airplane mode, then open `/student` inside the app: you should see **"You're offline."** Open `/`: the home page should still load.
6. Record the phone model, Android version and Chrome version below.

### iPhone (Safari)

1. Open the preview URL in **Safari**.
2. Tap **Share → Add to Home Screen → Add**. Confirm the name says "Perqly" and the icon looks right.
3. Open Perqly from the Home Screen. It must open without Safari's address bar.
4. Check the header and the bottom "Get Perqly" bar aren't hidden under the notch or home indicator (safe areas).
5. Airplane mode: `/student` shows "You're offline.", and `/` still loads.
6. Record the iPhone model and iOS version below.

### Device results log

| Date      | Device | OS / browser | Install | Standalone | Offline | Notes | Tester |
| --------- | ------ | ------------ | ------- | ---------- | ------- | ----- | ------ |
| (pending) |        |              |         |            |         |       |        |
