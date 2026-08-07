import { getSessionCookieName, isValidAdminSession } from "../../../lib/admin-auth";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

function isDraftKey(value: string): boolean {
  return /^drafts\/[a-f0-9-]+\.(jpg|png|webp)$/i.test(value);
}

export async function POST(request: Request) {
  if (!(await isValidAdminSession(cookieValue(request, getSessionCookieName())))) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown; olderThanHours?: unknown };
  const dryRun = body.dryRun !== false;
  const olderThanHours = typeof body.olderThanHours === "number" && Number.isFinite(body.olderThanHours) ? Math.min(Math.max(Math.floor(body.olderThanHours), 24), 24 * 30) : 24;
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
  const bucket = process.env.SUPABASE_UPLOAD_BUCKET || "photogift-uploads";
  const supabase = getSupabaseServerClient();

  try {
    const [{ data: uploads, error: uploadsError }, { data: items, error: itemsError }] = await Promise.all([
      supabase.from("order_uploads").select("storage_key"),
      supabase.from("order_items").select("customization"),
    ]);
    if (uploadsError) throw uploadsError;
    if (itemsError) throw itemsError;

    const referenced = new Set<string>();
    for (const upload of uploads ?? []) if (typeof upload.storage_key === "string") referenced.add(upload.storage_key);
    for (const item of items ?? []) {
      const customization = item.customization as { photoPath?: unknown } | null;
      if (typeof customization?.photoPath === "string") referenced.add(customization.photoPath);
    }

    const files: Array<{ name: string; created_at?: string }> = [];
    for (let offset = 0; offset < 5000; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list("drafts", { limit: 1000, offset, sortBy: { column: "created_at", order: "asc" } });
      if (error) throw error;
      files.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const orphanKeys = files
      .map((file) => ({ key: `drafts/${file.name}`, createdAt: file.created_at ? Date.parse(file.created_at) : NaN }))
      .filter((file) => isDraftKey(file.key) && Number.isFinite(file.createdAt) && file.createdAt < cutoff && !referenced.has(file.key))
      .map((file) => file.key);

    if (!dryRun && orphanKeys.length > 0) {
      const { error } = await supabase.storage.from(bucket).remove(orphanKeys);
      if (error) throw error;
    }

    return Response.json({ dryRun, olderThanHours, candidates: orphanKeys.length, deleted: dryRun ? 0 : orphanKeys.length });
  } catch (error) {
    console.error("Draft cleanup failed", error);
    return Response.json({ error: "Could not scan temporary uploads." }, { status: 500 });
  }
}
