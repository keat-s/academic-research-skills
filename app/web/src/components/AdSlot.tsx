import { useEffect, useState } from "react";
import { api, type MonetizationConfig } from "../api";

// Non-intrusive, config-gated ad placement. Renders nothing unless the
// deployer explicitly enables ads (ARS_ADS_ENABLED=true) — keeping the default
// experience ad-free and the NC-licensed content unmonetized by default.
export function AdSlot() {
  const [cfg, setCfg] = useState<MonetizationConfig["ads"] | null>(null);

  useEffect(() => {
    api.monetization().then((m) => setCfg(m.ads)).catch(() => {});
  }, []);

  if (!cfg?.enabled || !cfg.publisherId) return null;

  return (
    <div className="card text-xs text-slate-400">
      <div className="mb-1 uppercase tracking-wide text-[10px] text-slate-500">Sponsor</div>
      {/* EthicalAds renders into this container by data attributes. */}
      <div
        data-ea-publisher={cfg.publisherId}
        data-ea-type="text"
        data-ea-style="stickybox"
      />
      <p className="mt-2 text-[10px] text-slate-600">{cfg.note}</p>
    </div>
  );
}
