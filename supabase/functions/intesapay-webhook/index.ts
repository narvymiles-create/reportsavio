// Receives IntesaPay payment notifications. Signature is verified, the delivery is
// recorded once, and the authoritative status is re-fetched before anything is activated.
import { verifyIntesaSignature } from "../_shared/billing/intesapay.ts";
import { adminClient, corsHeaders, intesaClient, json, syncPayment, type PaymentRow } from "../_shared/billing/server.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = adminClient();
  const raw = await req.text();
  const secret = Deno.env.get("INTESAPAY_WEBHOOK_SECRET") ?? "";
  const valid = await verifyIntesaSignature(secret, req.headers.get("IntesaPay-Signature"), raw);
  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* recorded below */ }
  const deliveryId = req.headers.get("IntesaPay-Delivery") ?? body?.id ?? null;
  const eventType = req.headers.get("IntesaPay-Event") ?? body?.type ?? null;
  const reference: string | null = body?.data?.reference ?? null;

  if (!valid) {
    await admin.from("billing_webhook_events").insert({
      delivery_id: `rejected:${crypto.randomUUID()}`, event_type: eventType, payment_reference: reference,
      signature_valid: false, payload: body, result: "invalid_signature", processed_at: new Date().toISOString(),
    });
    return json({ error: "Invalid signature" }, 401);
  }
  if (!deliveryId) return json({ error: "Missing delivery id" }, 400);

  const { error: dupErr } = await admin.from("billing_webhook_events").insert({
    delivery_id: deliveryId, event_type: eventType, payment_reference: reference, signature_valid: true, payload: body,
  });
  if (dupErr) {
    if (dupErr.code === "23505") return json({ ok: true, duplicate: true });
    console.error("webhook insert failed", dupErr);
    return json({ error: "Could not record event" }, 500);
  }

  const finish = (result: string, paymentId?: string) =>
    admin.from("billing_webhook_events").update({ result, payment_id: paymentId ?? null, processed_at: new Date().toISOString() }).eq("delivery_id", deliveryId);

  if (!eventType?.startsWith("payment.") || !reference) { await finish("ignored"); return json({ ok: true }); }
  const client = intesaClient();
  if (!client) { await finish("gateway_not_configured"); return json({ ok: true }); }
  if (body?.data?.external_merchant_id && body.data.external_merchant_id !== client.accountId) {
    await finish("other_merchant"); return json({ ok: true });
  }

  try {
    let { data: payment } = await admin.from("billing_payments").select("*").eq("gateway_reference", reference).maybeSingle();
    if (!payment && body?.data?.merchant_reference) {
      ({ data: payment } = await admin.from("billing_payments").select("*").eq("reference", body.data.merchant_reference).maybeSingle());
    }
    if (!payment) {
      // Hosted checkout: find the session that produced this payment.
      const { data: candidates } = await admin.from("billing_payments").select("*").eq("status", "pending")
        .not("checkout_session_id", "is", null).is("gateway_reference", null)
        .gt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(25);
      for (const c of candidates ?? []) {
        const s = await client.getCheckoutSession(c.checkout_session_id);
        if ((s.paymentReference ?? s.payment?.reference) === reference) { payment = c; break; }
      }
    }
    if (!payment) { await finish("unmatched"); return json({ ok: true }); }
    const result = await syncPayment(admin, client, payment as PaymentRow, reference);
    await finish(String((result as { result?: string }).result ?? "processed"), payment.id);
    return json({ ok: true });
  } catch (e) {
    console.error("webhook processing failed", e);
    await finish(`error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    // 5xx makes IntesaPay retry later.
    return json({ error: "Processing failed" }, 500);
  }
});
