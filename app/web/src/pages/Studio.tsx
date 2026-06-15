import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  PenLine,
  Search,
  Compass,
  Paperclip,
  Menu,
  X,
  Trash2,
  Sparkles,
  Heart,
  Settings,
  Square,
  Play,
  SendHorizontal,
  FileText,
  type LucideProps,
} from "lucide-react";
import type { Mode } from "@ars/core";
import { api, type Conversation, type UploadInfo } from "../api";
import { useAuth } from "../auth";
import { useChat, type UiMessage, type UseChat } from "../useChat";
import { loadSettings } from "../settings";
import { Markdown } from "../components/Markdown";
import { AdSlot } from "../components/AdSlot";
import { SourcesList, ExportMenu } from "../components/MessageExtras";
import { Badge } from "@/components/ui/badge";
import { SuggestedActions } from "../components/chat/SuggestedActions";
import { ModelPicker } from "../components/chat/ModelPicker";
import { MessageReasoning } from "../components/chat/MessageReasoning";
import { MessageActions } from "../components/chat/MessageActions";
import scioMark from "../scio/assets/scio-mark.svg";

/**
 * Split a leading <think>…</think> block (emitted by reasoning models such as
 * DeepSeek-R1 on the free tier) from the visible answer. Handles the still-open
 * case mid-stream so the reasoning panel fills live.
 */
function splitReasoning(content: string): { reasoning: string | null; body: string } {
  const closed = content.match(/^\s*<think>([\s\S]*?)<\/think>\s*/i);
  if (closed) return { reasoning: (closed[1] ?? "").trim(), body: content.slice(closed[0].length) };
  const open = content.match(/^\s*<think>([\s\S]*)$/i);
  if (open) return { reasoning: (open[1] ?? "").trim(), body: "" };
  return { reasoning: null, body: content };
}

type SkillIconComponent = React.ComponentType<LucideProps>;

interface SkillMeta {
  label: string;
  Icon: SkillIconComponent;
  /** One-line "what this skill does" — drives the capability cards. */
  desc: string;
  /** Dot color var for the capability card + flow strip. */
  dotVar: string;
  /** Display order (also the recommended pipeline order). */
  order: number;
}

const SKILL_META: Record<string, SkillMeta> = {
  "deep-research": {
    label: "Deep research",
    Icon: BookOpen,
    desc: "Investigate a question end-to-end — multi-agent search, fact-checking, and literature reviews.",
    dotVar: "var(--teal-500)",
    order: 0,
  },
  "academic-paper": {
    label: "Academic paper",
    Icon: PenLine,
    desc: "Turn research into a publication — outline, draft, revise, and bilingual abstracts.",
    dotVar: "var(--blue-500)",
    order: 1,
  },
  "academic-paper-reviewer": {
    label: "Paper reviewer",
    Icon: Search,
    desc: "Multi-perspective peer review — five reviewers plus a decision letter and revision roadmap.",
    dotVar: "var(--ochre-500)",
    order: 2,
  },
  "academic-pipeline": {
    label: "Full pipeline",
    Icon: Compass,
    desc: "The whole journey orchestrated — research → write → integrity → review → finalize.",
    dotVar: "var(--green-500)",
    order: 3,
  },
};

const SKILL_ORDER = Object.entries(SKILL_META)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([id]) => id);

/** Merge consecutive assistant rows (continuations) into single bubbles. */
function mergeAssistantRuns(rows: { role: "user" | "assistant"; content: string }[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.role === "assistant" && r.role === "assistant") {
      last.content += r.content;
    } else {
      out.push({ role: r.role, content: r.content });
    }
  }
  return out;
}

export function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [modes, setModes] = useState<Mode[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const chat = useChat(activeMode?.id ?? "");

  useEffect(() => {
    api.modes().then(setModes).catch(() => {});
    refreshConversations();
    refreshQuota();
  }, []);

  function refreshConversations() {
    api.conversations().then(setConversations).catch(() => {});
  }
  function refreshQuota() {
    api.quota().then(setQuota).catch(() => {});
  }

  // Load a conversation when the route has an id and modes are ready.
  useEffect(() => {
    if (!id || modes.length === 0) return;
    api
      .conversation(id)
      .then(({ conversation, messages }) => {
        const mode = modes.find((m) => m.id === conversation.mode_id) ?? null;
        setActiveMode(mode);
        chat.reset(
          mergeAssistantRuns(messages.map((m) => ({ role: m.role, content: m.content }))),
          conversation.id
        );
      })
      .catch(() => nav("/app", { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, modes]);

  function pickMode(mode: Mode) {
    setActiveMode(mode);
    chat.reset([], null);
    nav("/app");
    setSidebarOpen(false);
  }

  function newChat() {
    setActiveMode(null);
    chat.reset([], null);
    nav("/app");
    setSidebarOpen(false);
  }

  async function removeConversation(convId: string) {
    await api.deleteConversation(convId).catch(() => {});
    refreshConversations();
    if (convId === id) newChat();
  }

  // After a stream finishes, refresh the sidebar list + quota and sync the URL.
  useEffect(() => {
    if (!chat.streaming && chat.conversationId && chat.conversationId !== id) {
      refreshConversations();
      refreshQuota();
      nav(`/app/c/${chat.conversationId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.streaming]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-20 flex w-72 transform flex-col border-r border-border bg-card p-3 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <button onClick={newChat} className="flex items-center gap-2.5">
            <img src={scioMark} alt="" className="h-7 w-7" />
            <span className="text-base font-bold text-foreground">ARS Studio</span>
          </button>
          <button className="text-muted-foreground md:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <button className="btn-primary mt-4 w-full" onClick={newChat}>
          + New chat
        </button>

        <div className="mt-4 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          <div className="px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
            Recent
          </div>
          {conversations.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted-foreground">No chats yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg transition-colors ${
                c.id === id ? "bg-secondary" : "hover:bg-muted"
              }`}
            >
              <button
                onClick={() => {
                  nav(`/app/c/${c.id}`);
                  setSidebarOpen(false);
                }}
                className={`min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm ${
                  c.id === id ? "text-foreground" : "text-muted-foreground"
                }`}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => removeConversation(c.id)}
                className="mr-1 hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                title="Delete"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {quota && (
            <div className="px-1 font-mono text-xs text-[color:var(--text-subtle)]">
              <div className="mb-1 flex justify-between uppercase tracking-[0.08em] text-[10px]">
                <span>Free messages today</span>
                <span>
                  {quota.remaining}/{quota.limit}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(quota.remaining / Math.max(1, quota.limit)) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2 text-sm">
            <Link to="/support" className="btn-ghost flex flex-1 items-center justify-center gap-1.5">
              <Heart size={14} strokeWidth={2} /> Support
            </Link>
            <Link to="/settings" className="btn-ghost flex flex-1 items-center justify-center gap-1.5">
              <Settings size={14} strokeWidth={2} /> Settings
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-2 md:hidden">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setSidebarOpen(true)}>
            <Menu size={16} strokeWidth={2} />
          </button>
          <span className="truncate font-semibold text-foreground">{activeMode?.title ?? "ARS Studio"}</span>
        </header>

        {!activeMode ? (
          <ModeLauncher modes={modes} onPick={pickMode} userName={user?.displayName ?? null} />
        ) : (
          <ChatView mode={activeMode} chat={chat} />
        )}
      </main>
    </div>
  );
}

function ModeLauncher({
  modes,
  onPick,
  userName,
}: {
  modes: Mode[];
  onPick: (m: Mode) => void;
  userName: string | null;
}) {
  const [q, setQ] = useState("");
  const [activeSkill, setActiveSkill] = useState<string | null>(null);

  // Mode counts per skill (for the capability cards), computed from live data.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of modes) c[m.skill] = (c[m.skill] ?? 0) + 1;
    return c;
  }, [modes]);

  const searching = q.trim().length > 0;

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return modes.filter((m) => {
      if (activeSkill && m.skill !== activeSkill) return false;
      if (!searching) return true;
      return (
        m.title.toLowerCase().includes(ql) ||
        m.blurb.toLowerCase().includes(ql) ||
        m.triggers.some((t) => t.toLowerCase().includes(ql))
      );
    });
  }, [modes, q, activeSkill, searching]);

  // Group filtered modes by skill in the canonical pipeline order.
  const grouped = useMemo(() => {
    const groups: Record<string, Mode[]> = {};
    for (const m of filtered) (groups[m.skill] ??= []).push(m);
    return SKILL_ORDER.filter((s) => groups[s]?.length).map((s) => [s, groups[s]!] as const);
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6 animate-fade-up">
      <h1 className="text-2xl font-bold text-foreground">
        {userName ? `Hi ${userName} — what are you working on?` : "What are you working on?"}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {modes.length} workflows across four research skills — from a single question to a finished,
        peer-reviewed paper.
      </p>

      {/* Recommended pipeline flow — communicates the end-to-end journey at a glance. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">Typical flow</span>
        {SKILL_ORDER.slice(0, 3).map((s, i) => {
          const meta = SKILL_META[s];
          return (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-[color:var(--border-default)]">→</span>}
              <button
                onClick={() => {
                  setActiveSkill(s);
                  setQ("");
                }}
                className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:border-[color:var(--border-strong)] hover:bg-muted"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta?.dotVar }}
                />
                {meta?.label}
              </button>
            </span>
          );
        })}
        <span className="text-[color:var(--border-default)]">→</span>
        <button
          onClick={() => {
            setActiveSkill("academic-pipeline");
            setQ("");
          }}
          className="chip flex items-center gap-1.5"
        >
          <Compass size={13} strokeWidth={2} />
          or run the whole pipeline
        </button>
      </div>

      {/* Capability cards — what each skill does; double as filters. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SKILL_ORDER.map((skill) => {
          const meta = SKILL_META[skill];
          if (!meta) return null;
          const active = activeSkill === skill;
          const { Icon } = meta;
          return (
            <button
              key={skill}
              onClick={() => {
                setActiveSkill(active ? null : skill);
                setQ("");
              }}
              className={`rounded-2xl border p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 ${
                active
                  ? "border-[color:var(--border-accent)] bg-accent/30 ring-1 ring-inset ring-[color:var(--border-accent)]"
                  : "border-border bg-card hover:border-[color:var(--border-strong)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${meta.dotVar} 12%, transparent)` }}
                >
                  <Icon size={15} strokeWidth={2} style={{ color: meta.dotVar }} />
                </span>
                <span className="font-semibold text-foreground">{meta.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{meta.desc}</p>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                {counts[skill] ?? 0} {counts[skill] === 1 ? "mode" : "modes"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <input
          className="input"
          placeholder="Search modes… (e.g. lit review, peer review, abstract)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(activeSkill || searching) && (
          <button
            className="btn-ghost shrink-0 whitespace-nowrap px-3 py-2 text-xs"
            onClick={() => {
              setActiveSkill(null);
              setQ("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-6 space-y-8 pb-8">
        {grouped.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No modes match "{q}".{" "}
            <button className="underline" onClick={() => setQ("")}>
              Clear search
            </button>
            .
          </p>
        )}
        {grouped.map(([skill, list]) => {
          const meta = SKILL_META[skill];
          const { Icon } = meta ?? { Icon: BookOpen };
          return (
            <section key={skill}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon size={15} strokeWidth={2} style={{ color: meta?.dotVar }} />
                {meta?.label ?? skill}
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                  · {list.length} modes
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onPick(m)}
                    className="card group/mode text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[color:var(--border-accent)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{m.title}</span>
                      {m.conversational && (
                        <Badge variant="outline" className="chip">
                          dialogue
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.blurb}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-[0.06em] font-normal">
                        {m.output}
                      </Badge>
                      <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-[0.06em] font-normal">
                        {m.oversight} oversight
                      </Badge>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-subtle)]">
                        {m.spectrum}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ChatView({ mode, chat }: { mode: Mode; chat: UseChat }) {
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

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[color:var(--accent-soft)] border-t-[color:var(--accent)]" />
  );
}

function MessageBubble({
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
