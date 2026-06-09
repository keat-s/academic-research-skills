import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Mode } from "@ars/core";
import { api, type Conversation, type UploadInfo } from "../api";
import { useAuth } from "../auth";
import { useChat, type UiMessage } from "../useChat";
import { loadSettings } from "../settings";
import { Markdown } from "../components/Markdown";
import { AdSlot } from "../components/AdSlot";
import { SourcesList, ExportMenu } from "../components/MessageExtras";

const SKILL_LABELS: Record<string, string> = {
  "deep-research": "Deep Research",
  "academic-paper": "Academic Paper",
  "academic-paper-reviewer": "Paper Reviewer",
  "academic-pipeline": "Full Pipeline",
};

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

  // Load mode catalogue + conversation list + quota once.
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
          messages.map((m) => ({ role: m.role, content: m.content }) as UiMessage),
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
        className={`fixed inset-y-0 left-0 z-20 w-72 transform border-r border-white/10 bg-[#0b1220] p-3 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link to="/app" className="text-lg font-bold text-white" onClick={() => { setActiveMode(null); chat.reset([], null); }}>
            🎓 ARS Studio
          </Link>
          <button className="md:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <button className="btn-primary mt-3 w-full" onClick={() => { setActiveMode(null); chat.reset([], null); nav("/app"); setSidebarOpen(false); }}>
          + New
        </button>

        <div className="mt-4 max-h-[calc(100%-12rem)] space-y-1 overflow-y-auto pr-1">
          <div className="px-1 text-[11px] uppercase tracking-wide text-slate-500">Recent</div>
          {conversations.length === 0 && <p className="px-1 py-2 text-sm text-slate-600">No chats yet.</p>}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => { nav(`/app/c/${c.id}`); setSidebarOpen(false); }}
              className={`w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5 ${
                c.id === id ? "bg-white/10 text-white" : "text-slate-300"
              }`}
              title={c.title}
            >
              {c.title}
            </button>
          ))}
        </div>

        <div className="absolute inset-x-3 bottom-3 space-y-2">
          {quota && (
            <div className="text-xs text-slate-500">
              Free today: {quota.remaining}/{quota.limit} left
            </div>
          )}
          <div className="flex gap-2 text-sm">
            <Link to="/support" className="btn-ghost flex-1">☕ Support</Link>
            <Link to="/settings" className="btn-ghost flex-1">⚙️ Settings</Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2 md:hidden">
          <button className="btn-ghost" onClick={() => setSidebarOpen(true)}>☰</button>
          <span className="font-semibold">{activeMode?.title ?? "ARS Studio"}</span>
        </header>

        {!activeMode ? (
          <ModeLauncher modes={modes} onPick={pickMode} />
        ) : (
          <ChatView mode={activeMode} chat={chat} userName={user?.displayName ?? null} />
        )}
      </main>
    </div>
  );
}

function ModeLauncher({ modes, onPick }: { modes: Mode[]; onPick: (m: Mode) => void }) {
  const [q, setQ] = useState("");
  const grouped = useMemo(() => {
    const filtered = modes.filter(
      (m) =>
        !q ||
        m.title.toLowerCase().includes(q.toLowerCase()) ||
        m.blurb.toLowerCase().includes(q.toLowerCase()) ||
        m.triggers.some((t) => t.toLowerCase().includes(q.toLowerCase()))
    );
    const groups: Record<string, Mode[]> = {};
    for (const m of filtered) (groups[m.skill] ??= []).push(m);
    return groups;
  }, [modes, q]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-bold text-white">What are you working on?</h1>
      <p className="mt-1 text-slate-400">Pick a workflow. 25 modes across four research skills.</p>
      <input
        className="input mt-4"
        placeholder="Search modes… (e.g. lit review, peer review, abstract)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="mt-6 space-y-6">
        {Object.entries(grouped).map(([skill, list]) => (
          <section key={skill}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {SKILL_LABELS[skill] ?? skill}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onPick(m)}
                  className="card text-left transition hover:border-indigo-400 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{m.title}</span>
                    {m.conversational && <span className="text-xs text-indigo-300">dialogue</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{m.blurb}</p>
                  <div className="mt-2 flex gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                    <span>{m.spectrum}</span>·<span>{m.oversight} oversight</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ChatView({
  mode,
  chat,
  userName,
}: {
  mode: Mode;
  chat: ReturnType<typeof useChat>;
  userName: string | null;
}) {
  const [input, setInput] = useState("");
  const [grounding, setGrounding] = useState(loadSettings().grounding);
  const [attachments, setAttachments] = useState<UploadInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    chat.send(input, {
      grounding,
      uploadIds: attachments.length ? attachments.map((a) => a.id) : undefined,
    });
    setInput("");
    setAttachments([]);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden items-center gap-2 border-b border-white/10 px-4 py-2 md:flex">
        <span className="font-semibold text-slate-100">{mode.title}</span>
        <span className="text-xs text-slate-500">· {mode.output}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {chat.messages.length === 0 && (
            <div className="card">
              <p className="text-slate-300">
                {greeting(userName)} You're in <b>{mode.title}</b> mode — {mode.blurb}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {mode.conversational
                  ? "This is a guided dialogue. Start by telling me what you're thinking about."
                  : "Describe the task or paste your material to begin."}
              </p>
            </div>
          )}

          {chat.messages.map((m, i) => (
            <MessageBubble key={i} message={m} streaming={chat.streaming && i === chat.messages.length - 1} />
          ))}

          {chat.status === "grounding" && (
            <div className="my-2 text-sm text-indigo-300">🔎 Searching scholarly databases…</div>
          )}

          {chat.error && (
            <div className="card mt-3 border-rose-500/40 text-sm text-rose-300">
              {chat.error}
              {/quota|limit/i.test(chat.error) && (
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

      <form onSubmit={submit} className="border-t border-white/10 p-3">
        <div className="mx-auto max-w-3xl">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span key={a.id} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200">
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
              className="btn-ghost"
              title="Attach a document (PDF or text)"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "…" : "📎"}
            </button>
            <textarea
              className="input min-h-[44px] max-h-40 resize-y"
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
                Stop
              </button>
            ) : (
              <button className="btn-primary" disabled={!input.trim()}>
                Send
              </button>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <input type="checkbox" checked={grounding} onChange={(e) => setGrounding(e.target.checked)} />
              🔎 Ground citations (retrieve real sources)
            </label>
            <p className="text-[11px] text-slate-600">Verify every citation. Enter to send.</p>
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message, streaming }: { message: UiMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`my-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-100"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <Markdown>{message.content || (streaming ? "▍" : "")}</Markdown>
            {streaming && message.content && <span className="ml-0.5 animate-pulse">▍</span>}
            {message.sources && <SourcesList sources={message.sources} />}
            {!streaming && message.content && (
              <ExportMenu content={message.content} title={message.content.slice(0, 40)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function greeting(name: string | null) {
  return name ? `Hi ${name} —` : "Hi —";
}
