import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID, randomBytes } from "node:crypto";
import { env } from "./env.js";
import { stmts, type UserRow } from "./db.js";
import { issueToken } from "./auth.js";
import { track } from "./analytics.js";

// OAuth sign-in for Google + GitHub. Entirely config-gated: a provider only
// appears (and its routes only work) when its client id/secret are set. CSRF is
// handled with a short-lived signed `state` JWT — no server-side session store.

const stateSecret = new TextEncoder().encode(env.jwtSecret + ":oauth-state");

interface ProviderDef {
  id: "google" | "github";
  enabled: boolean;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  fetchProfile: (accessToken: string) => Promise<{ providerUserId: string; email: string; name?: string } | null>;
}

const providers: Record<string, ProviderDef> = {
  google: {
    id: "google",
    enabled: !!env.oauth.google.clientId && !!env.oauth.google.clientSecret,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    async fetchProfile(token) {
      const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const p = (await res.json()) as { sub: string; email?: string; name?: string };
      if (!p.email) return null;
      return { providerUserId: p.sub, email: p.email, name: p.name };
    },
  },
  github: {
    id: "github",
    enabled: !!env.oauth.github.clientId && !!env.oauth.github.clientSecret,
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    async fetchProfile(token) {
      const headers = { Authorization: `Bearer ${token}`, "User-Agent": "ARS-Studio", Accept: "application/json" };
      const userRes = await fetch("https://api.github.com/user", { headers });
      if (!userRes.ok) return null;
      const u = (await userRes.json()) as { id: number; login: string; name?: string; email?: string };
      let email = u.email;
      if (!email) {
        const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
          email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email;
        }
      }
      if (!email) return null;
      return { providerUserId: String(u.id), email, name: u.name ?? u.login };
    },
  },
};

function clientCreds(id: "google" | "github") {
  return id === "google" ? env.oauth.google : env.oauth.github;
}
function redirectUri(id: string) {
  return `${env.serverUrl}/api/auth/oauth/${id}/callback`;
}

export const oauthRoutes = new Hono();

/** Which providers are usable — the web app shows buttons for these. */
oauthRoutes.get("/providers", (c) =>
  c.json({ providers: Object.values(providers).filter((p) => p.enabled).map((p) => p.id) })
);

oauthRoutes.get("/:provider/start", async (c) => {
  const provider = providers[c.req.param("provider")];
  if (!provider || !provider.enabled) return c.json({ error: "provider_unavailable" }, 404);
  const creds = clientCreds(provider.id);
  const state = await new SignJWT({ p: provider.id, n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(stateSecret);
  const url = new URL(provider.authUrl);
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", redirectUri(provider.id));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scope);
  url.searchParams.set("state", state);
  return c.redirect(url.toString());
});

oauthRoutes.get("/:provider/callback", async (c) => {
  const provider = providers[c.req.param("provider")];
  if (!provider || !provider.enabled) return c.json({ error: "provider_unavailable" }, 404);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.redirect(`${env.webUrl}/login?oauth_error=missing_code`);

  // Verify CSRF state.
  try {
    const { payload } = await jwtVerify(state, stateSecret);
    if (payload.p !== provider.id) throw new Error("provider mismatch");
  } catch {
    return c.redirect(`${env.webUrl}/login?oauth_error=bad_state`);
  }

  const creds = clientCreds(provider.id);
  // Exchange code for an access token.
  const tokenRes = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(provider.id),
    }),
  });
  if (!tokenRes.ok) return c.redirect(`${env.webUrl}/login?oauth_error=token_exchange`);
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) return c.redirect(`${env.webUrl}/login?oauth_error=no_token`);

  const profile = await provider.fetchProfile(tokenJson.access_token);
  if (!profile) return c.redirect(`${env.webUrl}/login?oauth_error=no_profile`);

  const userId = upsertOauthUser(provider.id, profile);
  track("oauth_login", { userId, meta: { provider: provider.id } });
  const jwt = await issueToken(userId);
  // Hand the JWT back to the SPA, which stores it and continues.
  return c.redirect(`${env.webUrl}/oauth?token=${encodeURIComponent(jwt)}`);
});

/** Find or create a user for an OAuth identity, linking by email when possible. */
function upsertOauthUser(
  provider: string,
  profile: { providerUserId: string; email: string; name?: string }
): string {
  const linked = stmts.oauthAccount.get(provider, profile.providerUserId) as
    | { user_id: string }
    | undefined;
  if (linked) return linked.user_id;

  const email = profile.email.toLowerCase();
  let user = stmts.userByEmail.get(email) as UserRow | undefined;
  if (!user) {
    const id = randomUUID();
    // OAuth users have no usable password; store random bytes as the hash.
    const unusable = randomBytes(32).toString("hex") + ":" + randomBytes(32).toString("hex");
    stmts.insertUser.run(id, email, unusable, profile.name ?? null, Date.now());
    stmts.setEmailVerified.run(id); // provider already verified the email
    user = stmts.userById.get(id) as UserRow;
    track("signup", { userId: id, meta: { via: provider } });
  }
  stmts.insertOauthAccount.run(provider, profile.providerUserId, user.id, Date.now());
  return user.id;
}
