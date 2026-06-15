import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronsUpDown } from "lucide-react";
import type { ModelInfo } from "@ars/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { loadSettings, saveSettings } from "@/settings";
import type { LocalSettings } from "@/settings";
import { api } from "@/api";

const PROVIDER_LABELS: Record<LocalSettings["provider"], string> = {
  openrouter: "Cloud",
  ollama: "Ollama",
  webllm: "In-browser",
};

function ProviderBadge({ provider }: { provider: LocalSettings["provider"] }) {
  return (
    <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none">
      {PROVIDER_LABELS[provider]}
    </span>
  );
}

export function ModelPicker({
  className,
  onChange,
}: {
  className?: string;
  onChange?: () => void;
}) {
  const [settings, setSettings] = React.useState<LocalSettings>(() => loadSettings());
  const [models, setModels] = React.useState<ModelInfo[]>([]);

  React.useEffect(() => {
    api.models().catch(() => ({ models: [] as ModelInfo[], sharedKey: false })).then((r) => {
      setModels(r.models ?? []);
    });
  }, []);

  function currentLabel(): string {
    if (settings.provider === "openrouter") {
      if (!settings.model) return "Server default";
      const found = models.find((m) => m.id === settings.model);
      return found?.name ?? settings.model;
    }
    if (settings.provider === "ollama") {
      return settings.localModel || "Local model";
    }
    // webllm
    return settings.webllmModel || "In-browser";
  }

  function handleModelChange(value: string) {
    const next = saveSettings({ model: value });
    setSettings(next);
    onChange?.();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("flex items-center gap-1.5 text-sm", className)}
        >
          <ProviderBadge provider={settings.provider} />
          <span className="max-w-[140px] truncate">{currentLabel()}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Model</DropdownMenuLabel>

        {settings.provider === "openrouter" ? (
          <DropdownMenuRadioGroup
            value={settings.model}
            onValueChange={handleModelChange}
          >
            <DropdownMenuRadioItem value="">
              Server default (free)
            </DropdownMenuRadioItem>
            {models.map((m) => (
              <DropdownMenuRadioItem key={m.id} value={m.id}>
                <span className="flex-1 truncate">{m.name}</span>
                {m.free === false && (
                  <span className="ml-2 text-[10px] text-muted-foreground">paid</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Using {PROVIDER_LABELS[settings.provider]} — change model in Settings
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            Backend &amp; keys in Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
