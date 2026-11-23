# Perqly Android app (Trusted Web Activity)

The Android app is a thin wrapper made with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). It opens the Perqly website full screen in the phone's Chrome. All features, data and security live in the website and Supabase; nothing in this folder contains Perqly logic.

- Package id: `com.perqly.app` (permanent once uploaded to Google Play)
- Specification: "Perqly Android app (TWA): implementation specification" (founder-approved plan, revision 2)

## Environments

| Build    | `host` in `twa-manifest.json`                 | Where it goes                         |
| -------- | --------------------------------------------- | ------------------------------------- |
| Staging  | `perqly-git-main-vision61-studios.vercel.app` | Your own and testers' phones only     |
| Production | `perqly.online`                             | Friends' phones now; Google Play later |

`twa-manifest.json` in git is the **production** build (perqly.online) since version 1.1.0 (code 2). Switching between the two changes `host`, `fullScopeUrl`, `webManifestUrl`, the icon URLs and the shortcut URLs to `perqly.online`, and raises `appVersionCode`. Nothing else changes. `tests/android-config.test.ts` fails CI if the package id, colours, fallback or target SDK drift.

The website vouches for the app at `/.well-known/assetlinks.json` only where the Vercel variable `ANDROID_ASSET_LINK_FINGERPRINTS` is set (comma-separated SHA-256 fingerprints). Staging (Preview) and production both have the upload key. When the app goes on Google Play, add Play's app signing key to the same variable (comma-separated) and redeploy. Unset means 404 and no link.

## Rules

- The signing keystore lives in `C:\perqly-keys\`, never in this repository, with one offline backup. Passwords go in a password manager only, never in chat, files or git.
- Never commit `.apk`, `.aab` or keystores (`android/.gitignore` and the root `.gitignore` block them).
- A staging APK is never uploaded to Google Play.
- Uninstall the staging build before installing the perqly.online build: both use the package id `com.perqly.app`, and the old one still opens staging.

## First build on Windows (staging)

Needs Node.js LTS and about 10 GB free. Run in PowerShell.

1. `npm install -g @bubblewrap/cli`, then `bubblewrap --version`.
2. `bubblewrap doctor`. Let Bubblewrap download **JDK 17** and the Android SDK. The SDK path must have no spaces; if your Windows user name has one, install them to `C:\bubblewrap\jdk` and `C:\bubblewrap\android-sdk` and run `bubblewrap updateConfig --jdkPath="C:\bubblewrap\jdk" --androidSdkPath="C:\bubblewrap\android-sdk"`. Repeat `bubblewrap doctor` until it reports no problems.
3. `mkdir C:\perqly-keys` (not inside OneDrive or another synced folder).
4. In a **separate empty folder** (not this repo), run `bubblewrap init --manifest=https://perqly-git-main-vision61-studios.vercel.app/manifest.webmanifest`.
   - Answer with the values in `twa-manifest.json` here (package `com.perqly.app`, name Perqly, colours `#FFFFFF`, notifications on, fallback Custom Tabs).
   - Signing key: **create new**, path `C:\perqly-keys\perqly-upload.keystore`, alias `perqly-upload`. Choose strong passwords and save them in your password manager. Use your own name in the certificate; no company name.
5. The generated Android project is already committed in `android/`. From `android/`, run `bubblewrap update --skipVersionUpgrade` so it matches `twa-manifest.json` (the keystore path and alias there must match yours).
6. Open `android\app\build.gradle`. Confirm `compileSdkVersion 36` and `targetSdkVersion 36`; change 35 to 36 if needed. Repeat after every `bubblewrap update`.
7. `bubblewrap build`. It asks for the keystore password twice (one password for both questions; typing stays hidden). It creates `app-release-signed.apk` (phones) and `app-release-bundle.aab` (Play, production only).
8. `bubblewrap fingerprint list` (or `keytool -list -v -keystore C:\perqly-keys\perqly-upload.keystore -alias perqly-upload`) and copy the **SHA-256** line. It's public, not a secret; it goes into Vercel Preview as `ANDROID_ASSET_LINK_FINGERPRINTS`.
9. Back up the keystore to a USB drive kept somewhere safe.
10. Install on a phone: turn on Developer options (tap Build number 7 times) and USB debugging, connect, then `bubblewrap install`. Or copy the APK to the phone and open it in Files.

Until the staging fingerprint is set and verified, the app shows a thin address bar. After that, uninstall and reinstall and it disappears. Check with
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://perqly-git-main-vision61-studios.vercel.app&relation=delegate_permission/common.handle_all_urls`.

## If the build fails

- **"Could not reserve enough space for … object heap":** the laptop is short of memory. Close big apps and give Gradle less memory, once per laptop (not in the repo):
  `Set-Content -Path "$HOME\.gradle\gradle.properties" -Value "org.gradle.jvmargs=-Xmx1024m -Dfile.encoding=UTF-8"`
- **"minSdkVersion … cannot be smaller than version 24":** `twa-manifest.json` must keep `"minSdkVersion": 24` (Google's TWA library needs Android 7+), then run `bubblewrap update --skipVersionUpgrade`.
- Never paste a terminal log that contains a password. If one leaks, change it with `keytool -storepasswd -keystore C:\perqly-keys\perqly-upload.keystore` (PKCS12 keystores have one password for both questions).

## Later releases

1. Raise `appVersionCode` (and `appVersionName`) in `twa-manifest.json`.
2. `bubblewrap update`, then repeat step 6.
3. `bubblewrap build` and upload the new `.aab` (production builds only).

Website changes reach the app without a new build.
