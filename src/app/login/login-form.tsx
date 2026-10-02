"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/** Turns "912 34 567" or "+47 912 34 567" into "+4791234567". */
function normalise(input: string) {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length === 8) return `+47${digits}`;
  return `+${digits}`;
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithOtp({ phone: normalise(phone) });
    setBusy(false);
    if (error) setError("Kunne ikke sende kode. Sjekk nummeret og prøv igjen.");
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.verifyOtp({ phone: normalise(phone), token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) {
      setError("Feil kode. Prøv igjen.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="mt-6 space-y-3">
        <p className="text-sm">Vi har sendt en kode til <b>{normalise(phone)}</b>.</p>
        <input className="input text-center text-2xl tracking-widest" inputMode="numeric" autoComplete="one-time-code"
          placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        <button className="btn w-full" disabled={busy}>{busy ? "Sjekker…" : "Logg inn"}</button>
        <button type="button" className="w-full text-sm underline" onClick={() => setStep("phone")}>Bytt nummer</button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="mt-6 space-y-3">
      <input className="input text-lg" type="tel" inputMode="tel" autoComplete="tel" placeholder="912 34 567"
        value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />
      <button className="btn w-full" disabled={busy}>{busy ? "Sender…" : "Send kode"}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
