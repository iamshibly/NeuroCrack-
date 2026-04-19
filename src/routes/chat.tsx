import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Sparkles, Loader2 } from "lucide-react";
import { ChatSidebar } from "@/components/chat/Sidebar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { Button } from "@/components/ui/button";
import { chatStore, type Chat } from "@/lib/chat-store";
import { authStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import type { StructuredAnswer, AnswerBlock, RomanStatement, ImageStatusBlock, SourcesBlock, SubAnswerBlock, FinalAnswerBlock, HighlightChip } from "@/lib/chat-types";
import type { AgentResponse, Confidence } from "@/server/lib/types";
import { askQuestion } from "@/server/api/ask";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — NeuroCrack" },
      { name: "description", content: "Solve school, high school & admission test doubts with AI." },
    ],
  }),
  component: ChatPage,
});

// ---------------------------------------------------------------------------
// Map backend AgentResponse → frontend StructuredAnswer blocks
// ---------------------------------------------------------------------------
function confidenceToNumber(c: Confidence): number {
  return c === "high" ? 0.9 : c === "medium" ? 0.6 : 0.3;
}

/**
 * Shared helper: converts the render-mode fields of a response (or sub-answer)
 * into AnswerBlock[]. Used for both the main response and each sub-answer.
 */
function renderDataToBlocks(data: {
  renderMode?: string;
  answer: string;
  statementChecks?: AgentResponse["statementChecks"];
  finalOption?: string;
  finalAnswerText?: string;
  tableData?: AgentResponse["tableData"];
  stepData?: string[];
  visualHint?: AgentResponse["visualHint"];
}): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];

  // Build highlight chip for modes where a specific phrase IS the answer.
  // MCQ and Roman MCQ already have visual highlighting via finalOption/statementChecks —
  // comparison/table answers are self-explanatory through the table structure.
  const chipText = data.finalAnswerText?.trim();
  const canChip =
    !!chipText &&
    data.renderMode !== "mcq" &&
    data.renderMode !== "roman_mcq" &&
    data.renderMode !== "table";

  const makeChip = (): HighlightChip => ({
    type: "highlight_chip",
    text: chipText!,
    hasMath: chipText!.includes("$"),
  });

  if (data.renderMode === "mcq" && data.finalOption) {
    const finalBlock: FinalAnswerBlock = {
      type: "final_answer",
      option: data.finalOption,
      explanation: data.answer.trim() || undefined,
    };
    blocks.push(finalBlock);
  } else if (data.renderMode === "roman_mcq" && data.statementChecks?.length) {
    blocks.push({
      type: "roman_mcq",
      statements: data.statementChecks.map((s): RomanStatement => ({
        label: s.label,
        correct: s.correct,
        reason: s.reason,
      })),
      finalOption: data.finalOption,
      explanation: data.answer.trim() || undefined,
    });
  } else if (
    data.renderMode === "table" &&
    data.tableData?.columns.length &&
    data.tableData.rows.length
  ) {
    if (data.answer.trim()) blocks.push({ type: "plain", text: data.answer });
    blocks.push({ type: "table", columns: data.tableData.columns, rows: data.tableData.rows });
  } else if (data.renderMode === "math") {
    if (data.stepData?.length) {
      // Math with steps: context sentence → numbered steps → highlight chip
      if (data.answer.trim()) blocks.push({ type: "plain", text: data.answer });
      blocks.push({
        type: "steps",
        title: "Solution",
        steps: data.stepData.map((line) => {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0 && colonIdx < 20) {
            return { label: line.slice(0, colonIdx).trim(), text: line.slice(colonIdx + 1).trim() };
          }
          return { text: line };
        }),
      });
      // Chip comes after steps so the student sees the work first, answer second
      if (canChip) blocks.push(makeChip());
    } else {
      // stepData missing despite math renderMode — still show the answer text so it
      // is not silently dropped. Chip first for quick scan, then full explanation.
      if (canChip) blocks.push(makeChip());
      if (data.answer.trim()) blocks.push({ type: "plain", text: data.answer });
    }
  } else {
    // Text mode: highlight chip first so the key answer is immediately visible,
    // full explanation follows below
    if (canChip) blocks.push(makeChip());
    if (data.answer.trim()) blocks.push({ type: "plain", text: data.answer });
  }

  if (data.visualHint?.suggested) {
    blocks.push({
      type: "visual_hint",
      hintType: data.visualHint.type,
      description: data.visualHint.description,
    });
  }

  return blocks;
}

function agentResponseToStructured(res: AgentResponse): StructuredAnswer {
  const blocks: AnswerBlock[] = [];
  // Track whether any actual answer content was added (separate from decoration
  // blocks like image_status or sources, which don't count as answer content).
  let hasContentBlock = false;

  // ── Image status banner (partial images only) ──────────────────────────────
  if (res.imageInfo?.status === "partial") {
    const imgBlock: ImageStatusBlock = {
      type: "image_status",
      status: "partial",
      message: res.imageInfo.message,
      extractedSummary: res.imageInfo.extractedTextSummary,
    };
    blocks.push(imgBlock);
  }

  // ── Multi-question: render each sub-answer as a labeled block ──────────────
  if (res.subAnswers?.length) {
    for (const sa of res.subAnswers) {
      const innerBlocks = renderDataToBlocks(sa);
      if (innerBlocks.length === 0) {
        innerBlocks.push({ type: "plain", text: sa.answer || "—" });
      }
      const subBlock: SubAnswerBlock = {
        type: "sub_answer",
        questionNumber: sa.questionNumber,
        blocks: innerBlocks,
      };
      blocks.push(subBlock);
      hasContentBlock = true;
    }
  } else {
    // ── Single question ──────────────────────────────────────────────────────
    const mainBlocks = renderDataToBlocks(res);
    if (mainBlocks.length > 0) {
      blocks.push(...mainBlocks);
      hasContentBlock = true;
    }
  }

  // ── Sources ────────────────────────────────────────────────────────────────
  if (res.sourcesUsed?.length) {
    const sourcesBlock: SourcesBlock = {
      type: "sources",
      items: res.sourcesUsed.map((s) => ({ title: s.title, url: s.url })),
    };
    blocks.push(sourcesBlock);
  }

  // ── Clarification ──────────────────────────────────────────────────────────
  if (res.needsClarification && res.clarificationQuestion && res.clarificationOptions?.length) {
    blocks.push({
      type: "clarification",
      prompt: res.clarificationQuestion,
      options: res.clarificationOptions,
    });
    hasContentBlock = true;
  }

  // Safety net: if no content was rendered (e.g. renderDataToBlocks returned
  // nothing because answer was empty AND no finalAnswerText/stepData), fall back
  // to showing the raw answer text. This prevents silent blank responses even
  // when decoration blocks (image_status, sources) are present.
  if (!hasContentBlock) {
    console.log(`[frontend:noContentBlock] falling back to raw answer text len=${res.answer?.length ?? 0}`);
    blocks.push({ type: "plain", text: res.answer || "No answer returned." });
  }

  console.log(`[frontend:structured] blocks=${blocks.length} hasContent=${hasContentBlock} confidence=${res.confidence} renderMode="${res.renderMode ?? "none"}"`);

  return {
    blocks,
    confidence: confidenceToNumber(res.confidence),
    footer: res.metadata
      ? `${res.metadata.selectedClass} · ${res.metadata.selectedSubject}${res.metadata.selectedChapter ? ` · ${res.metadata.selectedChapter}` : ""}`
      : undefined,
  };
}

// ---------------------------------------------------------------------------

function ChatPage() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authStore.current()) navigate({ to: "/login" });
  }, [navigate]);

  useEffect(() => {
    const refresh = () => setChats(chatStore.list());
    refresh();
    return chatStore.subscribe(refresh);
  }, []);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);

  // Restore class/subject/chapter when switching chats
  useEffect(() => {
    if (active) {
      setSelectedClass(active.selectedClass ?? null);
      setSelectedSubject(active.selectedSubject ?? null);
      setSelectedChapter(active.selectedChapter ?? null);
    } else {
      setSelectedClass(null);
      setSelectedSubject(null);
      setSelectedChapter(null);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length]);

  const newChat = () => {
    setActiveId(null);
    setSelectedClass(null);
    setSelectedSubject(null);
    setSelectedChapter(null);
    setSidebarOpen(false);
  };

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    setSelectedSubject(null);
    setSelectedChapter(null);
    if (activeId) {
      chatStore.updateMeta(activeId, { selectedClass: cls, selectedSubject: null, selectedChapter: null });
    }
  };

  const handleSubjectChange = (subject: string) => {
    setSelectedSubject(subject || null);
    setSelectedChapter(null);
    if (activeId) {
      chatStore.updateMeta(activeId, { selectedSubject: subject || null, selectedChapter: null });
    }
  };

  const handleChapterChange = (chapter: string) => {
    setSelectedChapter(chapter || null);
    if (activeId) {
      chatStore.updateMeta(activeId, { selectedChapter: chapter || null });
    }
  };

  const send = async (text: string, image?: File | null) => {
    if (isSending) return;

    let imageDataUrl: string | undefined;
    if (image) {
      imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(image);
      });
    }

    // Send empty string when only an image is attached — the backend uses extracted
    // image text as the question. Do NOT use a sentinel like "[Image]" because it
    // is truthy and blocks the server from substituting the real extracted content.
    const apiMessage = text.trim();
    if (!apiMessage && !imageDataUrl) return;

    let chat = active;
    if (!chat) {
      chat = chatStore.create();
      chatStore.updateMeta(chat.id, { selectedClass, selectedSubject, selectedChapter });
      setActiveId(chat.id);
    }

    // Persist user message immediately so the bubble appears
    chatStore.addMessage(chat.id, { role: "user", content: text, imageDataUrl });
    setIsSending(true);

    try {
      const response = await askQuestion({
        data: {
          chatId: chat.id,
          message: apiMessage,
          selectedClass: selectedClass ?? "",
          selectedSubject: selectedSubject ?? "",
          selectedChapter: selectedChapter ?? null,
          recentMessages: (chat.messages ?? []).slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          image: imageDataUrl,
        },
      });

      chatStore.addMessage(chat.id, {
        role: "assistant",
        content: response.answer,
        structured: agentResponseToStructured(response),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred.";
      chatStore.addMessage(chat.id, {
        role: "assistant",
        content: `Sorry, I could not get an answer right now. ${errorMsg}`,
      });
    } finally {
      setIsSending(false);
    }
  };

  // Clarification chip click → send the chip text as a new user message
  const handleOptionSelect = (option: string) => {
    void send(option);
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
          {isSending && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!active || active.messages.length === 0 ? (
            <WelcomeScreen />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {active.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onOptionSelect={handleOptionSelect}
                />
              ))}
            </div>
          )}
        </div>

        <MessageInput
          onSend={(text, image) => void send(text, image)}
          disabled={isSending}
          selectedClass={selectedClass}
          selectedSubject={selectedSubject}
          selectedChapter={selectedChapter}
          onClassChange={handleClassChange}
          onSubjectChange={handleSubjectChange}
          onChapterChange={handleChapterChange}
        />
      </main>
    </div>
  );
}

function WelcomeScreen() {
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
        Select your class and subject below, then type your question to get clear, step-by-step answers.
      </p>
    </div>
  );
}
