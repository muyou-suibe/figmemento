import { getSessionCookieName } from "../../../lib/admin-auth";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": `${getSessionCookieName()}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` } });
}
