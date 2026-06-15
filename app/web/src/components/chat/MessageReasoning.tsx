import * as React from "react";
import { Brain, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";

export function MessageReasoning({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="flex w-fit items-center gap-1.5 text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <Brain className="h-3.5 w-3.5" />
        <span>{open ? "Hide reasoning" : "Show reasoning"}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </Button>

      {open && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Markdown>{reasoning}</Markdown>
        </div>
      )}
    </div>
  );
}
