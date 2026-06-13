# Monetization & the CC BY-NC 4.0 license

ARS Studio is built on the **Academic Research Skills** suite, which is licensed
**CC BY-NC 4.0** — *Attribution, NonCommercial*. That license shapes how this
app can be funded. The guiding rule:

> The app and its AI features are **free**. Nothing gates, paywalls, or charges
> for the NC-licensed content. Funding is voluntary, indirect, or user-supplied.

This is deliberately conservative. "NonCommercial" has fuzzy edges, so the
default build keeps every gray-area channel **off** and ships only the clearly
safe ones enabled.

## The channels

| Channel | Default | Why it's license-safe |
|---|---|---|
| **Donations / sponsorship** | on (if URLs set) | Voluntary gifts. They don't sell access to the work; the work stays free to everyone. The upstream project already links Buy Me a Coffee. |
| **Bring-Your-Own-Key tip jar** | on | Users supply their *own* OpenRouter key and pay their *own* provider. We sell nothing. An optional "tip if it helped" prompt sits next to it — still voluntary. |
| **Tip checkout (Stripe / payment link)** | off (set `STRIPE_SECRET_KEY` or `ARS_TIP_PAYMENT_LINK`) | A voluntary one-time tip via Stripe Checkout (`submit_type: donate`) or any hosted payment link. A tip buys nothing — no features unlock, no limits change — which keeps it on the donation side of the NC line. |
| **Supporter membership (Stripe subscription)** | off (set `STRIPE_SECRET_KEY` + `ARS_SUPPORTER_PRICE_ID`) | An optional recurring "supporter" membership via `@better-auth/stripe`. It is **non-gating by construction**: it only raises the daily *free* quota (`ARS_SUPPORTER_DAILY_MESSAGES`) and adds a cosmetic badge. No core feature, mode, or model is locked behind it — BYOK still bypasses the quota entirely. This keeps it a voluntary "support the project" gift rather than selling access. |
| **Affiliate / institutional grants** | off (set URLs to enable) | Affiliate links and a "fund this project" grants page are indirect revenue. They never change what the AI recommends (disclosed in-app), and access stays free. |
| **Non-intrusive ethical ads** | **off** | A single non-tracking placement (EthicalAds-style). This is the grayest under NC because ad revenue is arguably "commercial advantage." **Get the licensor's written sign-off before enabling** (`ARS_ADS_ENABLED=true`). |

## What we deliberately do NOT do

- No **gating** paid tiers or feature paywalls. (The optional Supporter membership
  raises only the free quota — it never locks a feature, mode, or model.)
- No charging for AI usage (free models are free; BYOK is the user's own cost).
- No reselling the skills or the app.
- No locking any mode behind payment.

## Supporter membership setup (optional)

1. Create a recurring **Price** in Stripe (Products → add a monthly/yearly price)
   and set its id as `ARS_SUPPORTER_PRICE_ID` (`price_...`).
2. Set `STRIPE_SECRET_KEY` (`sk_test_...` / `sk_live_...`).
3. Add a Stripe **webhook** pointing at `<ARS_SERVER_URL>/api/auth/stripe/webhook`,
   subscribe to `customer.subscription.*` + `checkout.session.completed`, and put
   the signing secret (`whsec_...`) in `STRIPE_WEBHOOK_SECRET`.
4. Optionally tune `ARS_SUPPORTER_DAILY_MESSAGES` (the raised free ceiling).

If `ARS_SUPPORTER_PRICE_ID` or `STRIPE_SECRET_KEY` is unset, the membership is
silently disabled and the server boots normally (the Settings card hides itself).

## Enabling channels

Everything is config-driven (`app/.env`). Set a URL to surface a link; leave it
blank to hide it. Ads require an explicit opt-in flag **and** a publisher id.

## If you need stronger commercial rights

The cleanest path to commercial monetization is to obtain a separate commercial
license from the copyright holder (Cheng-I Wu). CC BY-NC explicitly allows the
author to grant such terms. Until then, this app stays in the free/voluntary
lane described above.
