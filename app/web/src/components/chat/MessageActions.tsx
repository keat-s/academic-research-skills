import * as React from "react";
import { Copy, Check, RotateCcw, Play, Pencil, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Feedback = "up" | "down" | null;

export interface MessageActionsProps {
  content: string;
  isUser: boolean;
  isLast: boolean;
  canAct: boolean;
  stopped: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onContinue: () => void;
  onStartEdit: () => void;
  children?: React.ReactNode;
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", className)}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MessageActions({
  isUser,
  isLast,
  canAct,
  stopped,
  onCopy,
  onRegenerate,
  onContinue,
  onStartEdit,
  children,
}: MessageActionsProps) {
  const [copied, setCopied] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Feedback>(null);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleFeedback(value: "up" | "down") {
    setFeedback((prev) => (prev === value ? null : value));
  }

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-0.5 text-muted-foreground")}>
        {isUser ? (
          <>
            {canAct && (
              <IconButton label="Edit" onClick={onStartEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </>
        ) : (
          <>
            <IconButton label={copied ? "Copied!" : "Copy"} onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </IconButton>

            {isLast && canAct && (
              <IconButton label="Regenerate" onClick={onRegenerate}>
                <RotateCcw className="h-3.5 w-3.5" />
              </IconButton>
            )}

            {isLast && stopped && canAct && (
              <IconButton label="Continue" onClick={onContinue}>
                <Play className="h-3.5 w-3.5" />
              </IconButton>
            )}

            <IconButton
              label="Good response"
              onClick={() => handleFeedback("up")}
              className={cn(feedback === "up" && "text-green-500")}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </IconButton>

            <IconButton
              label="Bad response"
              onClick={() => handleFeedback("down")}
              className={cn(feedback === "down" && "text-red-500")}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </IconButton>
          </>
        )}

        {children}
      </div>
    </TooltipProvider>
  );
}
