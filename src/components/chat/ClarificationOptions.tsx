// Standalone clarification chip bar — use when the backend signals it needs
// more context before giving a full answer. Clicking a chip sends that option
// as the next user message.

type Props = {
  prompt: string;
  options: string[];
  onSelect: (option: string) => void;
};

export function ClarificationOptions({ prompt, options, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{prompt}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/60 hover:bg-secondary text-foreground transition-colors"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
