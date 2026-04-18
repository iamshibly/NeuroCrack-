import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — NeuroCrack" },
      { name: "description", content: "Reset your NeuroCrack password." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <AuthLayout
      title={sent ? "Check your inbox" : "Reset your password"}
      subtitle={sent ? "We sent you a reset link if that email exists." : "We'll email you a link to reset it"}
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center text-center py-4">
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account with <span className="text-foreground font-medium">{email}</span> exists, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl"
              placeholder="you@example.com"
              required
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 rounded-xl text-primary-foreground font-medium"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
          >
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
