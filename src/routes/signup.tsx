import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authStore } from "@/lib/auth-store";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — NeuroCrack" },
      { name: "description", content: "Start solving doubts with NeuroCrack." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    authStore.signIn(email);
    navigate({ to: "/chat" });
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start chatting in under a minute"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <GoogleButton onClick={() => { authStore.signIn("user@gmail.com"); navigate({ to: "/chat" }); }} label="Sign up with Google" />

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-card px-3 text-muted-foreground">or</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" placeholder="Jane Doe" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" placeholder="you@example.com" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" placeholder="At least 8 characters" required />
        </div>

        <Button
          type="submit"
          className="w-full h-11 rounded-xl text-primary-foreground font-medium"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
