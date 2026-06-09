# Packaging & store submission

ARS Studio ships from one web bundle to six targets. This doc covers building
the native artifacts and what each store needs. The CI workflows
(`.github/workflows/desktop-build.yml`, `mobile-build.yml`) produce **unsigned**
artifacts; signing and store upload require accounts + secrets only the project
owner can provide, so those steps are documented rather than automated.

## Web / PWA
`pnpm --filter ./web build` → `app/web/dist`. Deploy the static bundle to any
host (Netlify, Vercel, Cloudflare Pages, S3). The PWA is installable as-is. Set
`VITE_API_BASE` at build time to your deployed API origin.

## Desktop (Tauri)
```bash
pnpm --filter ./web build          # or let beforeBuildCommand handle it
pnpm --filter ./web tauri build
```
Outputs per-OS bundles under `app/web/src-tauri/target/release/bundle/`.

| OS | Format | Signing |
|---|---|---|
| macOS | `.dmg` / `.app` | Apple Developer ID cert; notarize with `notarytool`. Set `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`. |
| Windows | `.msi` / `.exe` | Authenticode cert (`WINDOWS_CERTIFICATE`). Unsigned installs show SmartScreen. |
| Linux | `.deb` / `.AppImage` / `.rpm` | Optional GPG signing. |

CI runs `desktop-build.yml` on a `v*` tag and uploads the bundles as artifacts.
Add the signing secrets to enable trusted distribution.

## Mobile (Capacitor)
```bash
pnpm --filter ./web build
pnpm --filter ./web cap:sync
npx cap add android      # or ios
npx cap open android     # or ios
```

### Android (Google Play)
- `mobile-build.yml` assembles a **debug** APK. For release: generate an upload
  keystore, set `ANDROID_KEYSTORE` + passwords, build `bundleRelease` (AAB),
  upload via the Play Console or fastlane `supply`.
- Metadata: `app/store/android/`.

### iOS (App Store)
- Requires an Apple Developer account ($99/yr). Set `APPLE_*` secrets + a
  provisioning profile, archive in Xcode or via `fastlane gym`, upload with
  `fastlane deliver` / Transporter.
- Metadata: `app/store/ios/`.

## What the project owner must supply (cannot be automated here)
1. Apple Developer + Google Play developer accounts.
2. Code-signing certs / keystores (stored as CI secrets, never committed).
3. Final app icons / screenshots (placeholders live in `app/store/`).
4. A privacy policy URL (both stores require one — see `app/store/privacy.md`).
5. The production API + a shared `OPENROUTER_API_KEY` (or BYOK-only mode).
