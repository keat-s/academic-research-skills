// Local-only user settings (never sent anywhere except the BYOK key, which
// goes directly to the server only to be forwarded to OpenRouter and is never
// persisted server-side).

const KEY = "ars_settings";

export interface LocalSettings {
  apiKey: string; // BYOK OpenRouter key (stored only in this browser)
  model: string; // preferred free model id ("" = server default)
}

const DEFAULTS: LocalSettings = { apiKey: "", model: "" };

export function loadSettings(): LocalSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Partial<LocalSettings>) {
  const next = { ...loadSettings(), ...s };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
