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
    <div className="card text-xs text-muted-foreground">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">Sponsor</div>
      {/* EthicalAds renders into this container by data attributes. */}
      <div
        data-ea-publisher={cfg.publisherId}
        data-ea-type="text"
        data-ea-style="stickybox"
      />
      <p className="mt-2 text-[10px] text-[color:var(--text-subtle)]">{cfg.note}</p>
    </div>
  );
}
