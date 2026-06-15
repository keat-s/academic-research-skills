// Shared domain types for ARS Studio.

export type Spectrum = "Fidelity" | "Balanced" | "Originality";
export type Oversight = "Low" | "Medium" | "High" | "Very High";
export type SkillId =
  | "deep-research"
  | "academic-paper"
  | "academic-paper-reviewer"
  | "academic-pipeline";

export interface Mode {
  /** Stable id used in URLs / API, e.g. "deep-research:lit-review". */
  id: string;
  skill: SkillId;
  /** Mode key within the skill, e.g. "lit-review". Empty string for the pipeline orchestrator. */
  mode: string;
  title: string;
  /** One-line description shown in the launcher. */
  blurb: string;
  spectrum: Spectrum;
  oversight: Oversight;
  /** Expected output shape, mirrors MODE_REGISTRY "Output" column. */
  output: string;
  /** Slash-command analogue, when one exists (e.g. "/ars-lit-review"). */
  command?: string;
  /** Trigger phrases used for search / quick-launch. */
  triggers: string[];
  /** Whether this mode is conversational (Socratic) vs single-shot production. */
  conversational: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  /** True when the model is free to call on OpenRouter (":free" suffix or zero pricing). */
  free: boolean;
  contextLength?: number;
}

export interface ChatRequest {
  modeId: string;
  messages: ChatMessage[];
  model?: string;
  /** Bring-your-own-key: when present the server forwards it to OpenRouter instead of the shared key. */
  apiKey?: string;
  temperature?: number;
}

/**
 * License-safe monetization configuration (CC-BY-NC 4.0).
 * Canonical definition lives here in core so both the server (monetize.ts)
 * and the web client (api.ts) share a single source of truth.
 */
export interface MonetizationConfig {
  donations: { label: string; url: string }[];
  sponsorTiers: { name: string; blurb: string; url: string }[];
  affiliates: { label: string; url: string; note: string }[];
  grants: { label: string; url: string }[];
  ads: {
    enabled: boolean;
    /** e.g. "ethicalads" | "carbon" */
    provider: string;
    publisherId: string;
    note: string;
  };
  byok: {
    enabled: boolean;
    note: string;
  };
}
