import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Menu, X, Trash2, Heart, Settings } from "lucide-react";
import type { Mode } from "@ars/core";
import { api, type Conversation } from "../api.js";
import { useAuth } from "../auth.js";
import { useChat } from "../useChat.js";
import { mergeAssistantRuns } from "../lib/chat.js";
import { ModeLauncher } from "../components/studio/ModeLauncher.js";
import { ChatView } from "../components/studio/ChatView.js";
import scioMark from "../scio/assets/scio-mark.svg";

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
