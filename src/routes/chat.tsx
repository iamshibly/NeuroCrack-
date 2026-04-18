import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Sparkles, Calculator, FlaskConical, BookOpen, GraduationCap } from "lucide-react";
import { ChatSidebar } from "@/components/chat/Sidebar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { Button } from "@/components/ui/button";
import { chatStore, type Chat } from "@/lib/chat-store";
import { authStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — NeuroCrack" },
      { name: "description", content: "Solve school, high school & admission test doubts with AI." },
    ],
  }),
  component: ChatPage,
});

const SUGGESTIONS = [
  { icon: Calculator, title: "Solve a math problem", prompt: "Solve this step-by-step and explain each step: " },
  { icon: FlaskConical, title: "Explain a science concept", prompt: "Explain photosynthesis in simple terms with a real-life example." },
  { icon: BookOpen, title: "Help with English", prompt: "Summarize this passage and explain the difficult words: " },
  { icon: GraduationCap, title: "Admission test doubt", prompt: "Help me understand this concept for my entrance exam: " },
];

function ChatPage() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auth gate (client-side mock)
  useEffect(() => {
    if (!authStore.current()) navigate({ to: "/login" });
  }, [navigate]);

  useEffect(() => {
    const refresh = () => setChats(chatStore.list());
    refresh();
    return chatStore.subscribe(refresh);
  }, []);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length]);

  const newChat = () => {
    setActiveId(null);
    setSidebarOpen(false);
  };

  const send = (text: string) => {
    let chat = active;
    if (!chat) {
      chat = chatStore.create();
      setActiveId(chat.id);
    }
    chatStore.addMessage(chat.id, { role: "user", content: text });
    // Mock assistant reply — replace with real LLM call later.
    setTimeout(() => {
      chatStore.addMessage(chat!.id, {
        role: "assistant",
        content:
          "This is a placeholder response. Connect your AI backend to start receiving real answers here.",
      });
    }, 600);
  };

  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {/* Sidebar — desktop */}
      <div className="hidden md:flex w-72 shrink-0">
        <ChatSidebar
          activeChatId={activeId}
          onSelect={(id) => setActiveId(id)}
          onNewChat={newChat}
        />
      </div>

      {/* Sidebar — mobile drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 transition",
          sidebarOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-foreground/20 transition-opacity",
            sidebarOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setSidebarOpen(false)}
        />
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-72 max-w-[85%] transition-transform",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <ChatSidebar
            activeChatId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              setSidebarOpen(false);
            }}
            onNewChat={newChat}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-3 md:px-6 gap-2 bg-background/80 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="text-sm font-medium text-foreground truncate">
            {active?.title ?? "New chat"}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!active || active.messages.length === 0 ? (
            <WelcomeScreen onPick={(p) => send(p)} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {active.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </div>

        <MessageInput onSend={send} />
      </main>
    </div>
  );
}

function WelcomeScreen({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-12">
      <div
        className="h-14 w-14 rounded-2xl flex items-center justify-center text-primary-foreground mb-5"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Sparkles className="h-7 w-7" />
      </div>
      <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight text-center">
        What doubt can I clear today?
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        Ask any school, high school, or admission test question — get clear, step-by-step answers.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="group text-left p-4 rounded-2xl bg-card border border-border hover:border-primary/40 hover:bg-secondary/60 transition-all"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center text-primary shrink-0">
                <s.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{s.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.prompt}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
