# Splitting ARS Studio into its own repository

ARS Studio is designed to live as a standalone repo. The `app/` tree carries
everything a standalone repo needs — its own `.github/workflows/` (re-rooted),
`LICENSE`, and `NOTICE.md` — so a subtree split is publish-ready as-is.

## Produce the standalone repo

```bash
# From the monorepo root:
git subtree split --prefix=app -b standalone/ars-studio

# Publish it:
git clone <monorepo> ars-studio --branch standalone/ars-studio --single-branch
cd ars-studio
git checkout -b main
git remote set-url origin git@github.com:<you>/ars-studio.git
git push -u origin main
```

Cosmetic note: a couple of README lines assume the monorepo layout
(`cd app` in Quick start, and the relative link to the parent suite README).
A finishing commit fixing those exists in the distributed
`ars-studio.bundle`; or just adjust the two lines by hand.

## What transfers

- Full git history of `app/` (subtree split preserves it).
- CI: build + unit tests (`ci.yml`), Playwright E2E (`e2e.yml`), Tauri desktop
  matrix (`desktop-build.yml`, on `v*` tags), Capacitor Android/iOS
  (`mobile-build.yml`, manual).
- License: CC BY-NC 4.0 inherited from the parent suite, with attribution in
  `NOTICE.md`.
