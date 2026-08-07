import { getSessionCookieName, isValidAdminSession } from "../../../lib/admin-auth";
import { getSupabaseServerClient } from "../../../lib/supabase-server";
import { readUploadConfig } from "../../../config/server";

const maxBytes = 15 * 1024 * 1024;

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : null;
}

export async function POST(request: Request) {
  if (!(await isValidAdminSession(cookieValue(request, getSessionCookieName())))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const form = await request.formData();
  const orderNumber = String(form.get("orderNumber") || "").trim().toUpperCase();
  const orderItemId = String(form.get("orderItemId") || "").trim();
  const file = form.get("file");
  if (!/^PG-[A-Z0-9-]+$/.test(orderNumber) || !/^[a-f0-9-]{20,}$/.test(orderItemId) || !(file instanceof File)) return Response.json({ error: "Order, item, and delivery file are required." }, { status: 400 });
  if (file.size <= 0 || file.size > maxBytes) return Response.json({ error: "The digital file must be between 1 byte and 15 MB." }, { status: 400 });
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  if (!["jpg", "jpeg", "png", "webp", "pdf", "zip"].includes(extension)) return Response.json({ error: "Use JPG, PNG, WEBP, PDF, or ZIP for digital delivery." }, { status: 400 });
  const supabase = getSupabaseServerClient();
  const { data: order, error: orderError } = await supabase.from("orders").select("id").eq("order_number", orderNumber).maybeSingle();
  if (orderError) return Response.json({ error: "Could not read order." }, { status: 500 });
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
  const { data: item, error: itemError } = await supabase.from("order_items").select("id, customization, products(is_digital)").eq("id", orderItemId).eq("order_id", order.id).maybeSingle();
  if (itemError) return Response.json({ error: "Could not read order item." }, { status: 500 });
  if (!item) return Response.json({ error: "Order item not found." }, { status: 404 });
  if (!(item.products as { is_digital?: boolean } | null)?.is_digital) return Response.json({ error: "This order item is not digital." }, { status: 409 });
  const storageKey = `deliveries/${orderNumber}/${orderItemId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(readUploadConfig().bucket).upload(storageKey, new Uint8Array(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) return Response.json({ error: "Could not upload digital delivery." }, { status: 500 });
  const { error: updateError } = await supabase.from("order_items").update({ customization: { ...(item.customization || {}), digitalDeliveryPath: storageKey, digitalDeliveryName: file.name } }).eq("id", orderItemId).eq("order_id", order.id);
  if (updateError) return Response.json({ error: "Could not save digital delivery." }, { status: 500 });
  return Response.json({ ok: true, fileName: file.name });
}
