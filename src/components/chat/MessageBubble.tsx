import { Sparkles, User } from "lucide-react";
import type { Message } from "@/lib/chat-store";
import { cn } from "@/lib/utils";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3 md:gap-4", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "h-8 w-8 shrink-0 rounded-xl flex items-center justify-center",
          isUser ? "bg-secondary text-secondary-foreground" : "text-primary-foreground",
        )}
        style={isUser ? undefined : { background: "var(--gradient-primary)" }}
      >
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border text-card-foreground rounded-tl-sm",
        )}
        style={isUser ? undefined : { boxShadow: "var(--shadow-soft)" }}
      >
        {message.content}
      </div>
    </div>
  );
}
