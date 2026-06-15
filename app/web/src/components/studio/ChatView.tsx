import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Paperclip,
  X,
  Sparkles,
  Square,
  Play,
  SendHorizontal,
  FileText,
} from "lucide-react";
import type { Mode } from "@ars/core";
import { api, type UploadInfo } from "../../api.js";
import type { UseChat } from "../../useChat.js";
import { loadSettings } from "../../settings.js";
import { AdSlot } from "../AdSlot.js";
import { ModelPicker } from "../chat/ModelPicker.js";
import { SuggestedActions } from "../chat/SuggestedActions.js";
import { MessageBubble } from "./MessageBubble.js";
import { SKILL_META } from "./skillMeta.js";

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[color:var(--accent-soft)] border-t-[color:var(--accent)]" />
  );
}

export function ChatView({ mode, chat }: { mode: Mode; chat: UseChat }) {
  const [input, setInput] = useState("");
  const [grounding, setGrounding] = useState(loadSettings().grounding);
  const [attachments, setAttachments] = useState<UploadInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = SKILL_META[mode.skill];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  function sendText(text: string) {
    if (!text.trim() || chat.streaming) return;
    chat.send(text, {
      grounding,
      uploadIds: attachments.length ? attachments.map((a) => a.id) : undefined,
    });
    setInput("");
    setAttachments([]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    sendText(input);
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const info = await api.uploadFile(file);
        setAttachments((prev) => [...prev, info]);
      } catch {
        /* ignore individual failures */
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const lastIndex = chat.messages.length - 1;
  const { Icon: SkillIcon } = meta ?? { Icon: BookOpen };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden items-center gap-2.5 border-b border-border bg-background px-5 py-2.5 md:flex">
        <span className="chip flex items-center gap-1.5">
          <SkillIcon size={13} strokeWidth={2} />
          {meta?.label}
        </span>
        <span className="font-semibold text-foreground">{mode.title}</span>
        <span className="font-mono text-xs text-[color:var(--text-subtle)]">· {mode.output}</span>
        <ModelPicker className="ml-auto" />
      </div>

      <div className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {chat.messages.length === 0 && (
            <div className="animate-fade-up">
              <div className="card">
                <p className="text-foreground">
                  You're in <b>{mode.title}</b> mode — {mode.blurb}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {mode.conversational
                    ? "This is a guided dialogue. Start by telling me what you're thinking about."
                    : "Describe the task or paste your material to begin. Attach a PDF with the paperclip if you have one."}
                </p>
              </div>
              <div className="mt-4">
                <div className="mb-2 px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                  Try a starter
                </div>
                <SuggestedActions mode={mode} onPick={(text) => setInput(text)} />
              </div>
            </div>
          )}

          {chat.messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              streaming={chat.streaming && i === lastIndex}
              isLast={i === lastIndex}
              editing={editingIndex === i}
              canAct={!chat.streaming}
              stopped={chat.stopped && i === lastIndex}
              onCopy={() => navigator.clipboard?.writeText(m.content).catch(() => {})}
              onRegenerate={chat.regenerate}
              onContinue={chat.continueGeneration}
              onStartEdit={() => setEditingIndex(i)}
              onCancelEdit={() => setEditingIndex(null)}
              onSaveEdit={(text) => {
                setEditingIndex(null);
                chat.editAndResend(i, text);
              }}
            />
          ))}

          {chat.status === "grounding" && (
            <div className="my-2 flex items-center gap-2 text-sm text-[color:var(--accent-text)] animate-fade-up">
              <Spinner />
              <span>Reading the literature</span>
              <span className="scio-thinking-dots"><i /><i /><i /></span>
            </div>
          )}
          {chat.status?.startsWith("loading_model") && (
            <div className="my-2 flex items-center gap-2 text-sm text-[color:var(--accent-text)] animate-fade-up">
              <Spinner /> Loading local model{" "}
              {chat.status.includes(":") ? `(${chat.status.split(":")[1]}%)` : "…"} — downloads
              once, then it's cached.
            </div>
          )}

          {chat.error && (
            <div className="card mt-3 border-destructive/40 text-sm text-destructive animate-fade-up">
              {chat.error}
              {/quota|limit|key/i.test(chat.error) && (
                <>
                  {" "}
                  <Link to="/settings" className="underline">
                    Add your own key
                  </Link>{" "}
                  to keep going.
                </>
              )}
            </div>
          )}

          <div className="mt-4">
            <AdSlot />
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-border bg-card p-3">
        <div className="mx-auto max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  <FileText size={12} strokeWidth={2} />
                  {a.filename}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.txt,.md,.tex,.csv,.json,.bib,text/*,application/pdf"
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              className="btn-ghost px-3"
              title="Attach a document (PDF or text)"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Spinner /> : <Paperclip size={16} strokeWidth={2} />}
            </button>
            <textarea
              className="input max-h-40 min-h-[46px] resize-y"
              rows={1}
              placeholder={`Message ${mode.title}…`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(e);
                }
              }}
            />
            {chat.streaming ? (
              <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={chat.stop}>
                <Square size={14} strokeWidth={2} /> Stop
              </button>
            ) : chat.stopped ? (
              <button type="button" className="btn-primary flex items-center gap-1.5" onClick={chat.continueGeneration}>
                <Play size={14} strokeWidth={2} /> Continue
              </button>
            ) : (
              <button className="btn-primary flex items-center gap-1.5" disabled={!input.trim()}>
                <SendHorizontal size={14} strokeWidth={2} /> Send
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={grounding}
                onChange={(e) => setGrounding(e.target.checked)}
              />
              <Sparkles size={12} strokeWidth={2} />
              Ground citations (retrieve real sources)
            </label>
            <p className="font-mono text-[11px] text-[color:var(--text-subtle)]">Verify every citation · Enter to send</p>
          </div>
        </div>
      </form>
    </div>
  );
}
