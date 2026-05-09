import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Lock, Mail, User2, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhoneShell } from "@/components/PhoneShell";
import { PrototypeDisclaimer } from "@/components/PrototypeDisclaimer";
import { hashPin } from "@/lib/crypto";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (pin.length !== 4) { toast.error("PIN must be 4 digits"); setBusy(false); return; }
        const redirectUrl = `${window.location.origin}/app/dashboard`;
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName }, emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        if (data.user) {
          // Save PIN + full name to profile (trigger created the row)
          await supabase.from("profiles").update({ pin, full_name: fullName }).eq("id", data.user.id);
          toast.success("Welcome to AZEC!");
          nav({ to: "/setup" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        nav({ to: "/app/dashboard" });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col px-6 pt-8 pb-6 animate-float-up">
        <Link to="/" className="size-10 rounded-full glass flex items-center justify-center mb-6">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-3xl font-bold">{mode === "login" ? "Welcome back" : "Create account"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "login" ? "Sign in to continue your discipline streak." : "Start your debt-free journey today."}
        </p>

        <div className="mt-6 grid grid-cols-2 p-1 glass rounded-xl">
          {(["login", "signup"] as const).map((m) => (
            <button key={m}
              onClick={() => setMode(m)}
              className={`py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? "gold-bg" : "text-muted-foreground"}`}
            >
              {m === "login" ? "Login" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3 flex-1">
          {mode === "signup" && (
            <Field icon={<User2 className="size-4" />} placeholder="Full name" value={fullName} onChange={setFullName} required />
          )}
          <Field icon={<Mail className="size-4" />} placeholder="Email" type="email" value={email} onChange={setEmail} required />
          <Field icon={<Lock className="size-4" />} placeholder="Password" type="password" value={password} onChange={setPassword} required />
          {mode === "signup" && (
            <Field icon={<KeyRound className="size-4" />} placeholder="4-digit PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))} required />
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-4 gold-bg glow-gold py-3.5 rounded-xl font-semibold disabled:opacity-60"
          >
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </PhoneShell>
  );
}

function Field({
  icon, placeholder, value, onChange, type = "text", required, inputMode, maxLength,
}: {
  icon: React.ReactNode; placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; inputMode?: "numeric" | "text"; maxLength?: number;
}) {
  return (
    <label className="flex items-center gap-3 px-4 py-3 glass rounded-xl focus-within:ring-gold transition-all">
      <span className="text-primary">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        maxLength={maxLength}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
    </label>
  );
}
