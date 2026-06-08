import { Hono } from "hono";

// License-safe monetization config (CC-BY-NC 4.0).
//
// None of these gate features or charge for the NC-licensed content. They are
// voluntary (donations/sponsorship), user-supplied compute (BYOK), indirect
// (affiliate / grants), or non-intrusive (a single optional ad slot that the
// licensor can disable). Everything is config-driven so the deployer can turn
// channels on/off without code changes. See app/docs/MONETIZATION.md.

export interface MonetizationConfig {
  donations: { label: string; url: string }[];
  sponsorTiers: { name: string; blurb: string; url: string }[];
  affiliates: { label: string; url: string; note: string }[];
  grants: { label: string; url: string }[];
  ads: {
    enabled: boolean;
    provider: string; // e.g. "ethicalads" | "carbon"
    publisherId: string;
    note: string;
  };
  byok: {
    enabled: boolean;
    note: string;
  };
}

// Defaults are env-overridable so a fork can drop in its own links/IDs.
const env = process.env;

export const monetization: MonetizationConfig = {
  donations: [
    {
      label: "Buy Me a Coffee",
      url: env.ARS_DONATE_BMC_URL ?? "https://buymeacoffee.com/crucify020v",
    },
    { label: "Ko-fi", url: env.ARS_DONATE_KOFI_URL ?? "" },
    { label: "GitHub Sponsors", url: env.ARS_DONATE_GH_URL ?? "" },
  ].filter((d) => d.url),
  sponsorTiers: [
    {
      name: "Supporter",
      blurb: "Keep the lights on. Name in the README backers list.",
      url: env.ARS_SPONSOR_SUPPORTER_URL ?? "",
    },
    {
      name: "Lab / Institution",
      blurb: "Fund continued development for your research group.",
      url: env.ARS_SPONSOR_LAB_URL ?? "",
    },
  ].filter((s) => s.url),
  affiliates: [
    {
      label: "Reference managers & tools",
      url: env.ARS_AFFILIATE_TOOLS_URL ?? "",
      note: "We may earn a commission. Never affects what the AI recommends.",
    },
  ].filter((a) => a.url),
  grants: [
    {
      label: "Fund this project (open-science grants)",
      url: env.ARS_GRANTS_URL ?? "",
    },
  ].filter((g) => g.url),
  ads: {
    enabled: (env.ARS_ADS_ENABLED ?? "false") === "true",
    provider: env.ARS_ADS_PROVIDER ?? "ethicalads",
    publisherId: env.ARS_ADS_PUBLISHER_ID ?? "",
    note: "A single non-tracking placement. Disable any time via ARS_ADS_ENABLED.",
  },
  byok: {
    enabled: (env.ARS_BYOK_ENABLED ?? "true") === "true",
    note: "Add your own OpenRouter key to skip the daily free limit. Optionally tip if it helps you.",
  },
};

export const monetizeRoutes = new Hono();

monetizeRoutes.get("/", (c) => c.json(monetization));
