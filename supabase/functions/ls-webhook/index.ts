// HireFit — Lemon Squeezy webhook.
// Verifies the signature, then adds credits (10-scan pack) or updates the
// monthly subscription for the user named in checkout custom data.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("LS_WEBHOOK_SECRET") ?? "";
const VARIANT_PACK = Deno.env.get("LS_VARIANT_PACK") ?? "";
const VARIANT_SUB = Deno.env.get("LS_VARIANT_SUB") ?? "";
const PACK_CREDITS = Number(Deno.env.get("PACK_CREDITS") ?? "10");
// Set LS_ACCEPT_TEST_MODE=false when you go live, so test purchases stop granting credits.
const ACCEPT_TEST = (Deno.env.get("LS_ACCEPT_TEST_MODE") ?? "true").toLowerCase() !== "false";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function validSignature(raw: string, signature: string) {
  if (!SECRET || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

const SUB_EVENTS = new Set([
  "subscription_created", "subscription_updated", "subscription_cancelled", "subscription_resumed",
  "subscription_expired", "subscription_paused", "subscription_unpaused",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("X-Signature") ?? ""))) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const event: string = payload?.meta?.event_name ?? "";
  if (payload?.meta?.test_mode && !ACCEPT_TEST) return new Response("test mode ignored", { status: 200 });

  const data = payload?.data ?? {};
  const attrs = data.attributes ?? {};
  let userId: string | null = payload?.meta?.custom_data?.user_id ?? null;

  try {
    if (event === "order_created") {
      if (attrs.status !== "paid") return new Response("order not paid", { status: 200 });
      const variantId = String(attrs.first_order_item?.variant_id ?? "");
      if (variantId !== VARIANT_PACK) return new Response("not a pack order", { status: 200 });
      if (!userId) return new Response("no user", { status: 200 });
      const { error } = await admin.rpc("apply_pack_order", {
        p_user: userId, p_order_id: String(data.id), p_credits: PACK_CREDITS,
        p_amount: attrs.total ?? null, p_currency: attrs.currency ?? null, p_raw: payload,
      });
      if (error) throw error;
      return new Response("ok", { status: 200 });
    }

    if (SUB_EVENTS.has(event)) {
      if (VARIANT_SUB && String(attrs.variant_id ?? "") !== VARIANT_SUB) {
        return new Response("other variant", { status: 200 });
      }
      if (!userId) {
        const { data: p } = await admin.from("profiles").select("id").eq("ls_subscription_id", String(data.id)).maybeSingle();
        userId = p?.id ?? null;
      }
      if (!userId) return new Response("no user", { status: 200 });
      const validUntil = attrs.ends_at ?? attrs.renews_at ?? null;
      const { error } = await admin.rpc("apply_subscription", {
        p_user: userId, p_sub_id: String(data.id), p_status: String(attrs.status ?? ""),
        p_valid_until: validUntil, p_customer_id: attrs.customer_id ? String(attrs.customer_id) : null,
        p_event: event, p_raw: payload,
      });
      if (error) throw error;
      return new Response("ok", { status: 200 });
    }

    return new Response("ignored", { status: 200 });
  } catch (e) {
    console.error("webhook error", event, e);
    return new Response("error", { status: 500 }); // Lemon Squeezy will retry
  }
});
