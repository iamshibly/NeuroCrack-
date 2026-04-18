import { Send } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

type Props = { onSend: (text: string) => void; disabled?: boolean };

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 md:pb-6">
      <div
        className="relative flex items-end gap-2 bg-card border border-border rounded-3xl p-2 pl-4 transition-shadow focus-within:ring-2 focus-within:ring-ring/40"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 200) + "px";
          }}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask your doubt..."
          className="flex-1 resize-none bg-transparent outline-none py-2.5 text-sm placeholder:text-muted-foreground max-h-[200px]"
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="h-10 w-10 rounded-2xl shrink-0 text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-2">
        NeuroCrack may produce inaccurate information. Always verify important answers.
      </p>
    </div>
  );
}
