import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

interface SkillMeta {
  label: string;
  icon: string;
  /** One-line "what this skill does" — drives the capability cards. */
  desc: string;
  accent: string;
  ring: string;
  /** Dot color for the capability card + flow strip. */
  dot: string;
  /** Display order (also the recommended pipeline order). */
  order: number;
}

const SKILL_META: Record<string, SkillMeta> = {
  "deep-research": {
    label: "Deep Research",
    icon: "📚",
    desc: "Investigate a question end-to-end — multi-agent search, fact-checking, and literature reviews.",
    accent: "text-sky-300 border-sky-400/30 bg-sky-400/10",
    ring: "hover:border-sky-400/40",
    dot: "bg-sky-400",
    order: 0,
  },
  "academic-paper": {
    label: "Academic Paper",
    icon: "✍️",
    desc: "Turn research into a publication — outline, draft, revise, and bilingual abstracts.",
    accent: "text-violet-300 border-violet-400/30 bg-violet-400/10",
    ring: "hover:border-violet-400/40",
    dot: "bg-violet-400",
    order: 1,
  },
  "academic-paper-reviewer": {
    label: "Paper Reviewer",
    icon: "🔍",
    desc: "Multi-perspective peer review — five reviewers plus a decision letter and revision roadmap.",
    accent: "text-amber-300 border-amber-400/30 bg-amber-400/10",
    ring: "hover:border-amber-400/40",
    dot: "bg-amber-400",
    order: 2,
  },
  "academic-pipeline": {
    label: "Full Pipeline",
    icon: "🧭",
    desc: "The whole journey orchestrated — research → write → integrity → review → finalize.",
    accent: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
    ring: "hover:border-emerald-400/40",
    dot: "bg-emerald-400",
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
        className={`fixed inset-y-0 left-0 z-20 flex w-72 transform flex-col border-r border-white/10 bg-[#0b1220]/95 p-3 backdrop-blur transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <button onClick={newChat} className="flex items-center gap-2 text-base font-bold text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 font-serif text-sm shadow-md shadow-indigo-500/30">
              A
            </span>
            ARS Studio
          </button>
          <button className="text-slate-400 md:hidden" onClick={() => setSidebarOpen(false)}>
            ✕
          </button>
        </div>

        <button className="btn-primary mt-4 w-full" onClick={newChat}>
          + New chat
        </button>

        <div className="mt-4 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Recent
          </div>
          {conversations.length === 0 && (
            <p className="px-1 py-2 text-sm text-slate-600">No chats yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg transition-colors ${
                c.id === id ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <button
                onClick={() => {
                  nav(`/app/c/${c.id}`);
                  setSidebarOpen(false);
                }}
                className={`min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm ${
                  c.id === id ? "text-white" : "text-slate-300"
                }`}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                onClick={() => removeConversation(c.id)}
                className="mr-1 hidden rounded p-1 text-xs text-slate-500 hover:text-rose-300 group-hover:block"
                title="Delete"
              >
                🗑
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          {quota && (
            <div className="px-1 text-xs text-slate-500">
              <div className="mb-1 flex justify-between">
                <span>Free messages today</span>
                <span>
                  {quota.remaining}/{quota.limit}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                  style={{ width: `${(quota.remaining / Math.max(1, quota.limit)) * 100}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2 text-sm">
            <Link to="/support" className="btn-ghost flex-1">
              ☕ Support
            </Link>
            <Link to="/settings" className="btn-ghost flex-1">
              ⚙️ Settings
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2 md:hidden">
          <button className="btn-ghost px-3 py-1.5" onClick={() => setSidebarOpen(true)}>
            ☰
          </button>
          <span className="truncate font-semibold">{activeMode?.title ?? "ARS Studio"}</span>
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
      <h1 className="text-2xl font-bold text-white">
        {userName ? `Hi ${userName} — what are you working on?` : "What are you working on?"}
      </h1>
      <p className="mt-1 text-slate-400">
        {modes.length} workflows across four research skills — from a single question to a finished,
        peer-reviewed paper.
      </p>

      {/* Recommended pipeline flow — communicates the end-to-end journey at a glance. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-widest text-slate-600">Typical flow</span>
        {SKILL_ORDER.slice(0, 3).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-700">→</span>}
            <button
              onClick={() => {
                setActiveSkill(s);
                setQ("");
              }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-slate-300 transition-colors hover:border-white/25 hover:bg-white/5"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${SKILL_META[s]?.dot}`} />
              {SKILL_META[s]?.label}
            </button>
          </span>
        ))}
        <span className="text-slate-700">→</span>
        <button
          onClick={() => {
            setActiveSkill("academic-pipeline");
            setQ("");
          }}
          className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-emerald-300 transition-colors hover:border-emerald-400/40"
        >
          🧭 or run the whole pipeline
        </button>
      </div>

      {/* Capability cards — what each skill does; double as filters. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SKILL_ORDER.map((skill) => {
          const meta = SKILL_META[skill];
          if (!meta) return null;
          const active = activeSkill === skill;
          return (
            <button
              key={skill}
              onClick={() => {
                setActiveSkill(active ? null : skill);
                setQ("");
              }}
              className={`rounded-2xl border p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 ${
                active
                  ? `${meta.accent} ring-1 ring-inset`
                  : `border-white/10 bg-white/[0.03] ${meta.ring}`
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{meta.icon}</span>
                <span className="font-semibold text-slate-100">{meta.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{meta.desc}</p>
              <div className="mt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
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
          <p className="py-8 text-center text-sm text-slate-500">
            No modes match “{q}”. <button className="underline" onClick={() => setQ("")}>Clear search</button>.
          </p>
        )}
        {grouped.map(([skill, list]) => {
          const meta = SKILL_META[skill];
          return (
            <section key={skill}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <span>{meta?.icon}</span>
                {meta?.label ?? skill}
                <span className="text-xs font-normal text-slate-600">· {list.length} modes</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onPick(m)}
                    className={`card group/mode text-left transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/[0.07] ${meta?.ring ?? ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100">{m.title}</span>
                      {m.conversational && (
                        <Badge variant="outline" className={meta?.accent}>
                          dialogue
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{m.blurb}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="font-normal">
                        {m.output}
                      </Badge>
                      <Badge variant="secondary" className="font-normal">
                        {m.oversight} oversight
                      </Badge>
                      <span className="text-[10px] uppercase tracking-wider text-slate-600">
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden items-center gap-2.5 border-b border-white/10 px-5 py-2.5 md:flex">
        <span className={`chip border ${meta?.accent ?? ""}`}>
          {meta?.icon} {meta?.label}
        </span>
        <span className="font-semibold text-slate-100">{mode.title}</span>
        <span className="text-xs text-slate-500">· {mode.output}</span>
        <ModelPicker className="ml-auto" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {chat.messages.length === 0 && (
            <div className="animate-fade-up">
              <div className="card">
                <p className="text-slate-300">
                  You're in <b>{mode.title}</b> mode — {mode.blurb}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {mode.conversational
                    ? "This is a guided dialogue. Start by telling me what you're thinking about."
                    : "Describe the task or paste your material to begin. Attach a PDF with 📎 if you have one."}
                </p>
              </div>
              <div className="mt-4">
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
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
            <div className="my-2 flex items-center gap-2 text-sm text-indigo-300 animate-fade-up">
              <Spinner /> Searching scholarly databases…
            </div>
          )}
          {chat.status?.startsWith("loading_model") && (
            <div className="my-2 flex items-center gap-2 text-sm text-indigo-300 animate-fade-up">
              <Spinner /> Loading local model{" "}
              {chat.status.includes(":") ? `(${chat.status.split(":")[1]}%)` : "…"} — downloads
              once, then it's cached.
            </div>
          )}

          {chat.error && (
            <div className="card mt-3 border-rose-500/40 text-sm text-rose-300 animate-fade-up">
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

      <form onSubmit={submit} className="border-t border-white/10 bg-[#0b1220]/60 p-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-slate-200"
                >
                  📄 {a.filename}
                  <button
                    type="button"
                    className="text-slate-400 hover:text-rose-300"
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  >
                    ✕
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
              {uploading ? <Spinner /> : "📎"}
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
              <button type="button" className="btn-ghost" onClick={chat.stop}>
                ◼ Stop
              </button>
            ) : chat.stopped ? (
              <button type="button" className="btn-primary" onClick={chat.continueGeneration}>
                ▸ Continue
              </button>
            ) : (
              <button className="btn-primary" disabled={!input.trim()}>
                Send
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={grounding}
                onChange={(e) => setGrounding(e.target.checked)}
              />
              🔎 Ground citations (retrieve real sources)
            </label>
            <p className="text-[11px] text-slate-600">Verify every citation · Enter to send</p>
          </div>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-300" />
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
        <div className="w-full max-w-[85%] rounded-2xl border border-indigo-400/40 bg-indigo-500/10 p-3">
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
              Save & resend
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
              ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20"
              : "border border-white/10 bg-white/[0.05] text-slate-100"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <>
              {reasoning && <MessageReasoning reasoning={reasoning} />}
              <Markdown>{body}</Markdown>
              {streaming && <span className="cursor-blink ml-0.5 text-indigo-300">▍</span>}
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
