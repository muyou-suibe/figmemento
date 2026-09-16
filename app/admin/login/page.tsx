"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { brandName } from "../../config/identity.ts";
import styles from "../products/admin-products.module.css";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) {
      window.location.assign("/admin/orders");
      return;
    }
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setError(result.error || "Login failed.");
    setLoading(false);
  }

  return <main className={`${styles.fusionAdminShell} ${styles.fusionAdminLogin} admin-shell admin-login-shell`}><section className={`${styles.fusionAdminLoginCard} admin-login-card`}><p className="eyebrow">{brandName} · Local operations</p><h1>Admin login</h1><p>Enter the password configured for this project.</p><form className="checkout-form" onSubmit={submit}><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button className="button button-dark full-button" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>{error && <p className="admin-login-error">{error}</p>}</form><Link className="admin-back-link" href="/">Back to storefront</Link></section></main>;
}
