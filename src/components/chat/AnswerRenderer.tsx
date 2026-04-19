import { ImageIcon, GitBranch, BarChart2, AlignLeft, Table2, ImageOff, BookOpen, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableRenderer } from "./TableRenderer";
import { InlineMath, DisplayMath, TextWithMath } from "./MathRenderer";
import type {
  StructuredAnswer,
  AnswerBlock,
  MCQBlock,
  FillBlock,
  StepsBlock,
  MathBlock,
  ClarificationBlock,
  BulletBlock,
  ShortAnswerBlock,
  PlainBlock,
  TableBlock,
  RomanMCQBlock,
  VisualHintBlock,
  ImageStatusBlock,
  SourcesBlock,
  FinalAnswerBlock,
  SubAnswerBlock,
  HighlightChip,
} from "@/lib/chat-types";

// ── Smart plain-text renderer ─────────────────────────────────────────────────
// Detects bullet lines (- / • / *) and groups them into <ul> blocks.
// Everything else is rendered as a paragraph. This handles the common case
// where the model returns a plain-text answer with embedded bullet lists.

type Segment = { kind: "para"; text: string } | { kind: "bullets"; items: string[] };

function parseSegments(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let bulletBuffer: string[] = [];
  let paraLines: string[] = [];

  const flushPara = () => {
    const joined = paraLines.join("\n").trim();
    if (joined) segments.push({ kind: "para", text: joined });
    paraLines = [];
  };
  const flushBullets = () => {
    if (bulletBuffer.length > 0) {
      segments.push({ kind: "bullets", items: [...bulletBuffer] });
      bulletBuffer = [];
    }
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^[\-\*•]\s+(.+)/);
    if (bulletMatch) {
      flushPara();
      bulletBuffer.push(bulletMatch[1].trim());
    } else {
      flushBullets();
      paraLines.push(line);
    }
  }
  flushPara();
  flushBullets();
  return segments;
}

function SmartText({ text }: { text: string }) {
  const segments = parseSegments(text);
  if (segments.length === 1 && segments[0]!.kind === "para") {
    return (
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        <TextWithMath text={segments[0].text} />
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.kind === "bullets" ? (
          <ul key={i} className="list-disc pl-5 space-y-1">
            {seg.items.map((item, j) => (
              <li key={j} className="text-sm leading-relaxed">
                <TextWithMath text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
            <TextWithMath text={seg.text} />
          </p>
        ),
      )}
    </div>
  );
}

// ── Block renderers ───────────────────────────────────────────────────────────

function PlainBlockView({ block }: { block: PlainBlock }) {
  return <SmartText text={block.text} />;
}

function BulletBlockView({ block }: { block: BulletBlock }) {
  return (
    <div>
      {block.heading && (
        <p className="font-semibold text-sm mb-1">{block.heading}</p>
      )}
      <ul className="list-disc pl-5 space-y-1">
        {block.items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MCQBlockView({ block }: { block: MCQBlock }) {
  const anyCorrectMarked = block.options.some((o) => o.isCorrect);
  return (
    <div className="space-y-2">
      {block.question && (
        <p className="font-semibold text-sm leading-snug">{block.question}</p>
      )}
      <div className="space-y-1.5">
        {block.options.map((opt) => (
          <div
            key={opt.label}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2 rounded-xl text-sm border",
              anyCorrectMarked
                ? opt.isCorrect
                  ? "bg-green-50 border-green-300 dark:bg-green-950/40 dark:border-green-700"
                  : "bg-muted/50 border-transparent opacity-70"
                : "bg-muted/40 border-transparent",
            )}
          >
            <span
              className={cn(
                "shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold",
                anyCorrectMarked && opt.isCorrect
                  ? "bg-green-500 text-white"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {opt.label}
            </span>
            <span className="leading-relaxed">{opt.text}</span>
          </div>
        ))}
      </div>
      {block.explanation && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-3 mt-2 leading-relaxed">
          {block.explanation}
        </p>
      )}
    </div>
  );
}

function FillBlockView({ block }: { block: FillBlock }) {
  let answerIdx = 0;
  return (
    <div className="space-y-1">
      <p className="text-sm leading-relaxed">
        {block.parts.map((part, i) => {
          if (part === "___") {
            const answer = block.answers[answerIdx++] ?? "?";
            return (
              <span
                key={i}
                className="inline-block font-semibold underline decoration-dotted decoration-primary mx-0.5"
              >
                {answer}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
      {block.explanation && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-3 leading-relaxed">
          {block.explanation}
        </p>
      )}
    </div>
  );
}

function ShortAnswerBlockView({ block }: { block: ShortAnswerBlock }) {
  return (
    <div className="space-y-1">
      {block.question && (
        <p className="text-sm font-semibold leading-snug">{block.question}</p>
      )}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.answer}</p>
    </div>
  );
}

function StepsBlockView({ block }: { block: StepsBlock }) {
  return (
    <div className="space-y-2">
      {block.title && <p className="font-semibold text-sm">{block.title}</p>}
      <ol className="space-y-2">
        {block.steps.map((step, i) => {
          const isFinal = step.label?.toLowerCase().startsWith("final") ||
                          step.text?.startsWith("∴") ||
                          step.label?.startsWith("∴");
          return (
            <li
              key={i}
              className={cn(
                "flex gap-2.5 items-start",
                isFinal && "math-final-step",
              )}
            >
              {isFinal ? (
                <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
                  ∴
                </span>
              ) : (
                <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
              )}
              <div className="text-sm leading-relaxed">
                {step.label && <span className="font-medium">{step.label}: </span>}
                {step.text && <TextWithMath text={step.text} />}
                {step.text && step.math && " "}
                {step.math && <InlineMath expression={step.math} />}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MathBlockView({ block }: { block: MathBlock }) {
  if (block.display) {
    return <DisplayMath expression={block.expression} caption={block.caption} />;
  }
  return (
    <p className="text-sm">
      <InlineMath expression={block.expression} />
    </p>
  );
}

function ClarificationBlockView({
  block,
  onOptionSelect,
}: {
  block: ClarificationBlock;
  onOptionSelect?: (option: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{block.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {block.options.map((option) => (
          <button
            key={option}
            onClick={() => onOptionSelect?.(option)}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/60 hover:bg-secondary text-foreground transition-colors"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function TableBlockView({ block }: { block: TableBlock }) {
  return (
    <div className="space-y-1.5">
      <TableRenderer columns={block.columns} rows={block.rows} caption={block.caption} />
    </div>
  );
}

function RomanMCQBlockView({ block }: { block: RomanMCQBlock }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {block.statements.map((stmt) => (
          <div
            key={stmt.label}
            className={cn(
              "roman-stmt flex items-start gap-3 px-3 py-2.5 rounded-xl text-sm border",
              stmt.correct
                ? "roman-stmt-correct bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                : "roman-stmt-wrong bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
            )}
          >
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              <span
                className={cn(
                  "h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  stmt.correct
                    ? "bg-green-500 text-white"
                    : "bg-red-500 text-white",
                )}
              >
                {stmt.correct ? "✓" : "✗"}
              </span>
              <span className="font-semibold text-muted-foreground w-4">{stmt.label}.</span>
            </div>
            <div>
              {stmt.reason && (
                <span className="text-sm leading-relaxed">{stmt.reason}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {block.finalOption && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Correct answer:</span>
          <span className="roman-final-option inline-flex items-center px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {block.finalOption}
          </span>
        </div>
      )}

      {block.explanation && (
        <p className="text-sm text-muted-foreground border-l-2 border-border pl-3 leading-relaxed whitespace-pre-wrap">
          {block.explanation}
        </p>
      )}
    </div>
  );
}

const VISUAL_HINT_ICONS: Record<VisualHintBlock["hintType"], React.ReactNode> = {
  diagram: <ImageIcon className="h-4 w-4" />,
  flowchart: <GitBranch className="h-4 w-4" />,
  chart: <BarChart2 className="h-4 w-4" />,
  table: <Table2 className="h-4 w-4" />,
  equation_layout: <AlignLeft className="h-4 w-4" />,
};

const VISUAL_HINT_LABELS: Record<VisualHintBlock["hintType"], string> = {
  diagram: "Diagram",
  flowchart: "Flowchart",
  chart: "Chart",
  table: "Table",
  equation_layout: "Equation layout",
};

function VisualHintBlockView({ block }: { block: VisualHintBlock }) {
  return (
    <div className="visual-hint flex items-start gap-3 px-3 py-2.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-sm">
      <span className="shrink-0 text-primary mt-0.5">{VISUAL_HINT_ICONS[block.hintType]}</span>
      <div>
        <span className="font-semibold text-primary text-xs uppercase tracking-wide mr-1.5">
          {VISUAL_HINT_LABELS[block.hintType]} suggestion
        </span>
        <span className="text-muted-foreground text-sm">{block.description}</span>
      </div>
    </div>
  );
}

function ImageStatusBlockView({ block }: { block: ImageStatusBlock }) {
  return (
    <div className="image-status-banner flex items-start gap-2.5 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 text-sm mb-1">
      <ImageOff className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
      <div className="min-w-0">
        <span className="font-medium text-amber-700 dark:text-amber-400 text-xs">
          Partial image
        </span>
        {block.message && (
          <span className="text-amber-600 dark:text-amber-500 text-xs ml-1.5">
            — {block.message}
          </span>
        )}
        {block.extractedSummary && (
          <p className="text-xs text-amber-600/80 dark:text-amber-500/70 mt-0.5 truncate">
            Read: "{block.extractedSummary}"
          </p>
        )}
      </div>
    </div>
  );
}

function FinalAnswerBlockView({ block }: { block: FinalAnswerBlock }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground font-medium">Answer:</span>
        <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm">
          {block.option}
        </span>
      </div>
      {block.explanation && (
        <p className="text-sm text-muted-foreground border-l-2 border-primary/30 pl-3 leading-relaxed whitespace-pre-wrap">
          {block.explanation}
        </p>
      )}
    </div>
  );
}

function HighlightChipView({ block }: { block: HighlightChip }) {
  return (
    <div className="answer-highlight-chip-wrap">
      <span className="text-xs font-medium text-muted-foreground">উত্তর:</span>
      <span className="answer-highlight-chip">
        {block.hasMath ? <TextWithMath text={block.text} /> : block.text}
      </span>
    </div>
  );
}

function SubAnswerBlockView({
  block,
  onOptionSelect,
}: {
  block: SubAnswerBlock;
  onOptionSelect?: (option: string) => void;
}) {
  return (
    <div className="sub-answer-block">
      <div className="sub-answer-header">
        <span className="sub-answer-label">{block.questionNumber}</span>
      </div>
      <div className="space-y-2">
        {block.blocks.map((b, i) => (
          <BlockView key={i} block={b} onOptionSelect={onOptionSelect} />
        ))}
      </div>
    </div>
  );
}

function SourcesBlockView({ block }: { block: SourcesBlock }) {
  if (!block.items.length) return null;
  return (
    <div className="sources-footer flex items-start gap-2 pt-2 border-t border-border/50 mt-1">
      <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {block.items.map((item, i) => (
          item.url ? (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {item.title}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span key={i} className="text-xs text-muted-foreground">
              {item.title}
            </span>
          )
        ))}
      </div>
    </div>
  );
}

// ── Main renderer ─────────────────────────────────────────────────────────────

type Props = {
  answer: StructuredAnswer;
  onOptionSelect?: (option: string) => void;
};

export function AnswerRenderer({ answer, onOptionSelect }: Props) {
  return (
    <div className="space-y-3">
      {answer.blocks.map((block, i) => (
        <BlockView key={i} block={block} onOptionSelect={onOptionSelect} />
      ))}
      {(answer.source || answer.footer || answer.confidence !== undefined) && (
        <div className="pt-1 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
          {answer.source && (
            <span className="text-xs text-muted-foreground">{answer.source}</span>
          )}
          {answer.confidence !== undefined && answer.confidence < 0.5 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
              ⚠ Low confidence
            </span>
          )}
          {answer.footer && (
            <span className="text-xs text-muted-foreground w-full">{answer.footer}</span>
          )}
        </div>
      )}
    </div>
  );
}

function BlockView({
  block,
  onOptionSelect,
}: {
  block: AnswerBlock;
  onOptionSelect?: (option: string) => void;
}) {
  switch (block.type) {
    case "plain":
      return <PlainBlockView block={block} />;
    case "bullets":
      return <BulletBlockView block={block} />;
    case "mcq":
      return <MCQBlockView block={block} />;
    case "fill":
      return <FillBlockView block={block} />;
    case "short":
      return <ShortAnswerBlockView block={block} />;
    case "steps":
      return <StepsBlockView block={block} />;
    case "math":
      return <MathBlockView block={block} />;
    case "clarification":
      return <ClarificationBlockView block={block} onOptionSelect={onOptionSelect} />;
    case "table":
      return <TableBlockView block={block} />;
    case "roman_mcq":
      return <RomanMCQBlockView block={block} />;
    case "visual_hint":
      return <VisualHintBlockView block={block} />;
    case "image_status":
      return <ImageStatusBlockView block={block} />;
    case "sources":
      return <SourcesBlockView block={block} />;
    case "final_answer":
      return <FinalAnswerBlockView block={block} />;
    case "sub_answer":
      return <SubAnswerBlockView block={block} onOptionSelect={onOptionSelect} />;
    case "highlight_chip":
      return <HighlightChipView block={block} />;
    default:
      return null;
  }
}
