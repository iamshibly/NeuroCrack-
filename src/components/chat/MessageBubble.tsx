import { Sparkles, User } from "lucide-react";
import type { Message } from "@/lib/chat-store";
import { AnswerRenderer } from "@/components/chat/AnswerRenderer";
import { cn } from "@/lib/utils";

type Props = {
  message: Message;
  onOptionSelect?: (option: string) => void;
};

export function MessageBubble({ message, onOptionSelect }: Props) {
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
          "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-card border border-border text-card-foreground rounded-tl-sm",
        )}
        style={isUser ? undefined : { boxShadow: "var(--shadow-soft)" }}
      >
        {isUser && message.imageDataUrl && (
          <img
            src={message.imageDataUrl}
            alt="Attached"
            className="max-h-48 max-w-full rounded-xl mb-2 block"
          />
        )}
        {!isUser && message.structured ? (
          <AnswerRenderer answer={message.structured} onOptionSelect={onOptionSelect} />
        ) : (
          message.content && <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>
    </div>
  );
}
