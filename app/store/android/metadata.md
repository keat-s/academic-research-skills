# Google Play metadata

Maps to fastlane `supply` layout (`fastlane/metadata/android/en-US/`).

- **title.txt:** ARS Studio
- **short_description.txt:** Free AI copilot for academic research, writing & review.
- **full_description.txt:** see `../listing.md` (full description).
- **video.txt:** (optional)

## Required assets (supply before submission)
- App icon 512×512 (placeholder: `app/web/public/icon-512.png`).
- Feature graphic 1024×500.
- ≥ 2 phone screenshots (16:9 or 9:16).
- Content rating questionnaire (IARC).
- Data safety form — mirror `../privacy.md`.

## Release
Build an AAB (`./gradlew bundleRelease`) signed with your upload keystore, then
upload via Play Console or `fastlane supply`.
