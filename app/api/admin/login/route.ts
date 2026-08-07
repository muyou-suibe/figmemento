import { createAdminSession, getAdminPassword, getSessionCookieHeader } from "../../../lib/admin-auth";

export async function POST(request: Request) {
  if (!getAdminPassword()) return Response.json({ error: "Admin password is not configured." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (typeof body.password !== "string" || body.password !== getAdminPassword()) return Response.json({ error: "Incorrect password." }, { status: 401 });
  const token = await createAdminSession();
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": getSessionCookieHeader(token) } });
}
