# Packaging & store submission

ARS Studio ships from one web bundle to six targets. This doc covers building
the native artifacts and what each store needs. The CI workflows
(`.github/workflows/desktop-build.yml`, `mobile-build.yml`) produce **unsigned**
artifacts; signing and store upload require accounts + secrets only the project
owner can provide, so those steps are documented rather than automated.

## API origin — required for packaged builds (read this first)
The web client reads its API base from `VITE_API_BASE` (falls back to a relative
`/api`). A relative base is fine for the **web/PWA** target (same origin as the
server) but is **broken for Capacitor and Tauri**: those load from
`capacitor://localhost` / `tauri://localhost`, so `/api` resolves against the app
shell and every request 404s.

- Set the GitHub repo **variable** `ARS_API_BASE` (Settings → Secrets and
  variables → Actions → Variables) to your absolute hosted API origin, e.g.
  `https://api.arsstudio.app`. The mobile/desktop workflows inject it at build.
- The web build hard-fails for a packaged target when `VITE_API_BASE` is missing
  or relative (guard in `vite.config.ts`, keyed on `ARS_PACKAGED_TARGET`). This
  is intentional — better a loud build failure than a silently dead artifact.
- **Tauri CSP:** `web/src-tauri/tauri.conf.json` `app.security.csp` whitelists
  `connect-src`. It ships with `localhost:8787` (dev), the scholarly hosts, and
  `openrouter.ai`. For release you **must add your `ARS_API_BASE` origin** to
  `connect-src` (and should drop `http://localhost:8787`), or the desktop app's
  API calls are blocked by the webview. Either edit the file or pass
  `tauri build --config '{"app":{"security":{"csp":"…"}}}'` in CI.

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

## Server database path and backup (production)

`ARS_DB_PATH` defaults to `./data/ars.db` (relative to the server's working
directory). In production **always set it to an absolute path on a persistent
volume**, e.g. `/data/ars.db` or `/var/lib/arsstudio/ars.db`. A relative path
is fine in dev but breaks when the process is started from a different directory
or the container's working directory changes.

```
ARS_DB_PATH=/data/ars.db   # add to your .env or container env
```

**WAL checkpoint on shutdown.** The server registers `SIGTERM`/`SIGINT` handlers
that run `PRAGMA wal_checkpoint(TRUNCATE)` + `db.close()` before exiting. This
ensures the WAL file is fully flushed into the main DB file and the `-wal` /
`-shm` side-files are removed, making the backup a single clean file copy.

**Backup strategies:**

| Approach | When to use |
|---|---|
| **Litestream** (`litestream replicate`) | Best for containers / Fly.io. Continuously streams WAL frames to S3-compatible storage with sub-second RPO. Zero application changes needed — just run Litestream as a sidecar. See https://litestream.io. |
| **Periodic `VACUUM INTO`** | Simple cron approach. `VACUUM INTO '/backups/ars-$(date +%Y%m%d).db'` produces a defragmented, WAL-free snapshot without locking the live file. Schedule via `cron` or a k8s `CronJob`. |
| **Volume snapshot** | Stop the server (SIGTERM → clean close), snapshot the volume, restart. Suitable for low-traffic deployments with scheduled maintenance windows. |

> **Never** `cp` the live `.db` file without a prior `PRAGMA wal_checkpoint`
> or while the server is running — the copy may be inconsistent if unflushed WAL
> frames exist. Use `VACUUM INTO` or Litestream instead.

## What the project owner must supply (cannot be automated here)
1. Apple Developer + Google Play developer accounts.
2. Code-signing certs / keystores (stored as CI secrets, never committed).
3. Final app icons / screenshots (placeholders live in `app/store/`).
4. A privacy policy URL (both stores require one — see `app/store/privacy.md`).
5. The production API + a shared `OPENROUTER_API_KEY` (or BYOK-only mode).
