import { Hono } from "hono";
import { env } from "./env.js";
import { requireAuth } from "./auth.js";
import { track } from "./analytics.js";
import type { Env } from "./types.js";

// Voluntary tip jar. License-safe under CC BY-NC: a tip buys nothing — no
// features unlock, no limits change. Two config-gated paths:
//   1. Stripe Checkout (STRIPE_SECRET_KEY): the server creates a one-time
//      payment session via Stripe's REST API (no SDK dep) and redirects.
//   2. Hosted payment link (ARS_TIP_PAYMENT_LINK): plain redirect, zero server
//      involvement — works with Stripe Payment Links, LemonSqueezy, Ko-fi, etc.
// Neither configured → the tip section simply doesn't render.

const stripeEnabled = () => env.tips.stripeSecretKey.length > 0;

export const tipRoutes = new Hono<Env>();

tipRoutes.get("/config", (c) =>
  c.json({
    enabled: stripeEnabled() || env.tips.paymentLink.length > 0,
    stripe: stripeEnabled(),
    presets: env.tips.presets,
    currency: env.tips.currency,
    paymentLink: env.tips.paymentLink || null,
    note: "Tips are voluntary and never unlock features.",
  })
);

tipRoutes.post("/checkout", requireAuth, async (c) => {
  if (!stripeEnabled()) return c.json({ error: "stripe_disabled" }, 501);
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({}));
  const amount = Math.round(Number(body.amountCents));
  // Stripe minimum is ~$0.50; cap at $500 to catch typos.
  if (!Number.isFinite(amount) || amount < 100 || amount > 50_000) {
    return c.json({ error: "bad_amount", message: "Tip must be between 1 and 500." }, 400);
  }

  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": env.tips.currency,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": "ARS Studio tip (thank you!)",
    success_url: `${env.webUrl}/support?tip=success`,
    cancel_url: `${env.webUrl}/support?tip=cancelled`,
    submit_type: "donate",
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.tips.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("stripe checkout failed:", res.status, text.slice(0, 300));
    return c.json({ error: "checkout_failed" }, 502);
  }
  const session = (await res.json()) as { url?: string };
  if (!session.url) return c.json({ error: "checkout_failed" }, 502);
  track("tip_checkout", { userId, meta: { amountCents: amount } });
  return c.json({ url: session.url });
});
