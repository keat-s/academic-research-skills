# App Store (iOS) metadata

Maps to fastlane `deliver` layout (`fastlane/metadata/en-US/`).

- **name.txt:** ARS Studio
- **subtitle.txt:** AI copilot for academic research
- **description.txt:** see `../listing.md` (full description).
- **keywords.txt:** see `../listing.md` keywords (≤ 100 chars, comma-separated).
- **promotional_text.txt:** see `../listing.md`.
- **support_url.txt / privacy_url.txt:** fill in before submission.

## Required assets (supply before submission)
- App icon 1024×1024 (placeholder: `app/web/public/icon-512.png`, upscale/redraw).
- Screenshots for 6.7", 6.5", and 5.5" displays + iPad if you ship iPad.
- App privacy "nutrition label" — mirror `../privacy.md`.

## Release
Archive via Xcode or `fastlane gym`, upload with `fastlane deliver` / Transporter.
Requires an Apple Developer account and signing assets stored as CI secrets.
