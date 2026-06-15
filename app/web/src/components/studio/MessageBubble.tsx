import { useEffect, useState } from "react";
import type { UiMessage } from "../../useChat.js";
import { splitReasoning } from "../../lib/chat.js";
import { Markdown } from "../Markdown.js";
import { SourcesList, ExportMenu } from "../MessageExtras.js";
import { MessageReasoning } from "../chat/MessageReasoning.js";
import { MessageActions } from "../chat/MessageActions.js";

export function MessageBubble({
  message,
  streaming,
  isLast,
  editing,
  canAct,
  stopped,
  onCopy,
  onRegenerate,
  onContinue,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  message: UiMessage;
  streaming: boolean;
  isLast: boolean;
  editing: boolean;
  canAct: boolean;
  stopped: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onContinue: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
}) {
  const isUser = message.role === "user";
  const [draft, setDraft] = useState(message.content);
  const { reasoning, body } = isUser
    ? { reasoning: null as string | null, body: message.content }
    : splitReasoning(message.content);

  useEffect(() => {
    if (editing) setDraft(message.content);
  }, [editing, message.content]);

  if (isUser && editing) {
    return (
      <div className="my-3 flex justify-end animate-fade-up">
        <div className="w-full max-w-[85%] rounded-2xl border border-[color:var(--border-accent)] bg-accent/20 p-3">
          <textarea
            className="input min-h-[80px]"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSaveEdit(draft);
              if (e.key === "Escape") onCancelEdit();
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancelEdit}>
              Cancel
            </button>
            <button
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={!draft.trim()}
              onClick={() => onSaveEdit(draft)}
            >
              Save and resend
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group/msg my-3 flex ${isUser ? "justify-end" : "justify-start"} animate-fade-up`}>
      <div className="max-w-[85%]">
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary text-primary-foreground shadow-[var(--shadow-sm)]"
              : "border border-border bg-card text-foreground"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <>
              {reasoning && <MessageReasoning reasoning={reasoning} />}
              <Markdown>{body}</Markdown>
              {streaming && <span className="cursor-blink ml-0.5 text-[color:var(--accent-text)]">▍</span>}
              {message.sources && <SourcesList sources={message.sources} />}
            </>
          )}
        </div>

        {/* Action row */}
        {!streaming && message.content && (
          <div
            className={`mt-1 px-1 opacity-0 transition-opacity group-hover/msg:opacity-100 ${
              isLast ? "opacity-100" : ""
            } ${isUser ? "flex justify-end" : ""}`}
          >
            <MessageActions
              content={body}
              isUser={isUser}
              isLast={isLast}
              canAct={canAct}
              stopped={stopped}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onContinue={onContinue}
              onStartEdit={onStartEdit}
            >
              {!isUser && <ExportMenu content={body} title={body.slice(0, 40)} />}
            </MessageActions>
          </div>
        )}
      </div>
    </div>
  );
}
