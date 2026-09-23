import { useState, type FormEvent } from "react";
export function AccountForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/" + (register ? "register" : "login"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      setPassword(""); await onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="local-account-form" onSubmit={submit}>
    {register && <label>Your name<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>}
    <label>Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input required type="password" minLength={12} maxLength={128} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <p className="field-hint">Use at least 12 characters. Accounts belong to this installation; no email verification is sent.</p>
    {error && <p className="account-error" role="alert">{error}</p>}
    <button type="submit" className="primary full-width" disabled={busy}>{busy ? "Please wait…" : register ? "Create local account" : "Sign in"}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</button>
  </form>;
}
