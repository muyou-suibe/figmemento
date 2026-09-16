"use client";

import { useState, type FormEvent } from "react";
import styles from "./account.module.css";
import { useReferenceLanguage } from "../storefront/ReferenceLanguageProvider";

type CustomerAuthFormMode = "sign-in" | "sign-up";

interface CustomerAuthFormProps {
  readonly mode: CustomerAuthFormMode;
}

interface AuthResponse {
  readonly code?: unknown;
  readonly message?: unknown;
}

function authErrorKey(code: unknown): string {
  switch (code) {
    case "INVALID_REQUEST":
    case "INVALID_EMAIL": return "Customer authentication request was invalid.";
    case "INVALID_CREDENTIALS": return "The email or password is incorrect.";
    case "EMAIL_ALREADY_REGISTERED": return "This email is already registered.";
    case "RATE_LIMITED": return "Too many attempts. Please try again later.";
    case "AUTH_UNAVAILABLE":
    case "PROVIDER_FAILURE":
    default: return "Customer authentication is temporarily unavailable.";
  }
}

export function CustomerAuthForm({ mode }: CustomerAuthFormProps) {
  const { t } = useReferenceLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/customer-auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as AuthResponse;
      if (!response.ok) {
        setError(authErrorKey(body.code));
        return;
      }
      window.location.assign("/account");
    } catch {
      setError("Customer authentication is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  const isSignUp = mode === "sign-up";
  return (
    <form className={styles.form} onSubmit={submit} noValidate={false}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${mode}-email`}>{t("Email")}</label>
        <input
          className={styles.input}
          id={`${mode}-email`}
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete={isSignUp ? "email" : "username"}
          maxLength={254}
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${mode}-password`}>{t("Password")}</label>
        <input
          className={styles.input}
          id={`${mode}-password`}
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          maxLength={1024}
          required
        />
      </div>
      <button className={styles.submitButton} type="submit" disabled={loading}>
        {loading ? t("Working...") : isSignUp ? t("Create account") : t("Sign in")}
      </button>
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
    </form>
  );
}

export function CustomerSignOutButton() {
  const { t } = useReferenceLanguage();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/customer-auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as AuthResponse;
        setError(authErrorKey(body.code));
        return;
      }
      window.location.assign("/account");
    } catch {
      setError("Unable to sign out right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button className={styles.signOutButton} type="button" onClick={signOut} disabled={loading}>
        {loading ? t("Signing out...") : t("Sign out")}
      </button>
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
    </div>
  );
}
