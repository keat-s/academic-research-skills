import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";

// The app also ships as Capacitor (iOS/Android) + Tauri (desktop), where
// cross-origin cookies are unreliable — so auth runs in BEARER mode. We keep the
// session token in localStorage under the existing "ars_token" key (read from
// the `set-auth-token` response header) and send it back as
// `Authorization: Bearer <token>` on every auth-client request. `api.ts` reads
// the same key for all non-auth API calls.
// better-auth's client requires an ABSOLUTE base URL (a bare "/api" throws
// "Invalid base URL" at module load and white-screens the app). In dev the API
// is same-origin via the Vite proxy, so resolve a relative base against the
// current origin; an absolute VITE_API_BASE (prod cross-origin) is used as-is.
const RAW_BASE = (import.meta.env.VITE_API_BASE ?? "/api") as string;
const API_BASE = /^https?:\/\//i.test(RAW_BASE)
  ? RAW_BASE
  : `${window.location.origin}${RAW_BASE}`;

export const authClient = createAuthClient({
  // The server mounts better-auth at `/api/auth/*`. The client uses `baseURL`
  // verbatim as the endpoint prefix (it ignores `basePath` once baseURL carries
  // a path), so the full auth base must be baked in here.
  baseURL: `${API_BASE}/auth`,
  plugins: [stripeClient({ subscription: true })],
  fetchOptions: {
    // Send the stored bearer token on auth-client requests (getSession /
    // signOut / subscription.*) so they authenticate without cookies.
    auth: {
      type: "Bearer",
      token: () => localStorage.getItem("ars_token") ?? "",
    },
    // Capture a freshly issued token from the bearer plugin's response header.
    onSuccess: (ctx) => {
      const t = ctx.response.headers.get("set-auth-token");
      if (t) localStorage.setItem("ars_token", t); // reuse existing key
    },
  },
});
