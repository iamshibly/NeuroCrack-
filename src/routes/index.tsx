import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { authStore } from "@/lib/auth-store";
import { Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuroCrack — AI doubt solver for school & admissions" },
      { name: "description", content: "AI study buddy for school, high school, and admission test doubts. Get instant, clear explanations." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    if (authStore.current()) navigate({ to: "/chat" });
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--gradient-soft)" }}
    >
      <div className="max-w-xl text-center">
        <div
          className="mx-auto h-16 w-16 rounded-3xl flex items-center justify-center text-primary-foreground mb-6"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Sparkles className="h-8 w-8" />
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
          Meet NeuroCrack
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Your AI doubt solver for school, high school, and admission tests. Ask anything — get clear, step-by-step answers.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl text-primary-foreground font-medium"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center h-11 px-6 rounded-xl border border-border bg-card text-foreground font-medium hover:bg-secondary"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
