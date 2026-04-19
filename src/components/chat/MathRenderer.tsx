// Math rendering utilities used by AnswerRenderer.
// KaTeX-based inline and display math, plus smart text parsing with inline math support.

import katex from "katex";
import "katex/dist/katex.min.css";

// ── KaTeX helpers ─────────────────────────────────────────────────────────────

export function renderKatex(expression: string, display: boolean): string {
  try {
    return katex.renderToString(expression, { throwOnError: false, displayMode: display });
  } catch {
    return expression;
  }
}

export function InlineMath({ expression }: { expression: string }) {
  return (
    <span
      className="katex-inline"
      dangerouslySetInnerHTML={{ __html: renderKatex(expression, false) }}
    />
  );
}

export function DisplayMath({
  expression,
  caption,
}: {
  expression: string;
  caption?: string;
}) {
  return (
    <div className="my-3">
      <div
        className="overflow-x-auto text-center py-1"
        dangerouslySetInnerHTML={{ __html: renderKatex(expression, true) }}
      />
      {caption && (
        <p className="text-xs text-muted-foreground text-center mt-1">{caption}</p>
      )}
    </div>
  );
}

// ── Multiplication cleanup ────────────────────────────────────────────────────
// Converts plain-text digit×digit or digit x digit (letter x between two digits)
// to the proper × multiplication sign so it's never confused with a variable.

function cleanMultiplicationSign(text: string): string {
  // digit [space?] x [space?] digit → digit × digit
  return text.replace(/(\d)\s*\bx\b\s*(\d)/g, "$1 × $2");
}

// ── Bare-caret fallback ───────────────────────────────────────────────────────
// When the model outputs tan^2, x^3, (a+b)^2 etc. without $...$ wrapping,
// the ^ character is visible as a literal character. This splitter detects
// bare caret patterns in a plain-text segment and renders them as inline KaTeX.
// It is a FALLBACK — properly formatted model output uses $...$ and never needs this.

type TextNode = { isMath: false; text: string } | { isMath: true; expr: string };

function splitOnBareCarets(text: string): TextNode[] {
  // Matches: word+ OR (expr) followed by ^ and digit(s) or {expr}
  const re = /(\w+|\([^)]+\))\^(\d+|\{[^}]+\})/g;
  const nodes: TextNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push({ isMath: false, text: text.slice(lastIdx, match.index) });
    }
    const base = match[1]!;
    const rawExp = match[2]!;
    // Strip braces if already present (e.g. ^{2} → 2)
    const exp = rawExp.startsWith("{") ? rawExp.slice(1, -1) : rawExp;
    nodes.push({ isMath: true, expr: `${base}^{${exp}}` });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    nodes.push({ isMath: false, text: text.slice(lastIdx) });
  }

  return nodes.length > 0 ? nodes : [{ isMath: false, text }];
}

// ── Inline math parser ────────────────────────────────────────────────────────
// 1. Split on $...$ → render those as KaTeX.
// 2. For remaining plain-text segments: apply multiplication-sign cleanup,
//    then split on bare caret notation and render those sub-parts as KaTeX.

export function TextWithMath({ text }: { text: string }) {
  const dollarParts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {dollarParts.flatMap((part, di) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          return [<InlineMath key={`d${di}`} expression={part.slice(1, -1)} />];
        }
        const cleaned = cleanMultiplicationSign(part);
        const subParts = splitOnBareCarets(cleaned);
        // If nothing was split, avoid the map overhead
        if (subParts.length === 1 && !subParts[0]!.isMath) {
          return [<span key={`d${di}`}>{subParts[0].text}</span>];
        }
        return subParts.map((sp, si) =>
          sp.isMath
            ? <InlineMath key={`d${di}s${si}`} expression={sp.expr} />
            : <span key={`d${di}s${si}`}>{sp.text}</span>,
        );
      })}
    </>
  );
}
