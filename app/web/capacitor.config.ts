import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wraps the same Vite build (web/dist) for iOS and Android.
// Run: pnpm --filter ./web build && pnpm --filter ./web cap:sync
// Then open the native project: npx cap open ios | android
const config: CapacitorConfig = {
  appId: "com.arsstudio.app",
  appName: "ARS Studio",
  webDir: "dist",
  // For device testing against a hosted API, set the production API base via
  // VITE_API_BASE at build time; the bundled web app then calls it directly.
  server: {
    androidScheme: "https",
  },
};

export default config;
