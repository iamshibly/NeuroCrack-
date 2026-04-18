import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "var(--gradient-soft)" }}
    >
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center text-primary-foreground"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-foreground">NeuroCrack</span>
        </Link>

        <div
          className="bg-card border border-border rounded-3xl p-8"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>
          </div>
          {children}
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
