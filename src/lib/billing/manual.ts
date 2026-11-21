import { supabase } from "@/integrations/supabase/client";

/** Official Skavio Technologies mobile money number for manual payments. */
export const SKAVIO_PAYMENT_NUMBER = "0705466283";
/** WhatsApp contact for payment confirmations (same line, international format). */
export const SKAVIO_WHATSAPP = "256705466283";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const ENTITLEMENT_CHANGED = "skavio:entitlement-changed";

export type ReviewStatus = "awaiting_proof" | "submitted" | "approved" | "rejected" | "activated" | "cancelled";
/** Requests that still block a new one: one package request per school at a time. */
export const OPEN_REVIEW_STATUSES: ReviewStatus[] = ["awaiting_proof", "submitted", "approved"];
/** Requests the school may still cancel itself (not yet reviewed by Skavio). */
export const CANCELLABLE_REVIEW_STATUSES: ReviewStatus[] = ["awaiting_proof", "submitted"];
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  awaiting_proof: "Waiting for your payment proof",
  submitted: "Proof received · being verified",
  approved: "Verified · enter your activation key",
  rejected: "Not verified",
  activated: "Activated",
  cancelled: "Cancelled",
};

/** Ugandan numbers to WhatsApp's international form: 0772 123456 / +256 772 123456 → 256772123456. */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (/^0[37]\d{8}$/.test(digits)) return `256${digits.slice(1)}`;
  if (/^256[37]\d{8}$/.test(digits)) return digits;
  if (/^[37]\d{8}$/.test(digits)) return `256${digits}`;
  return null;
}

export function whatsappLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The message a school sends to Skavio after paying. */
export function paymentConfirmationText(o: { schoolName?: string | null; reference: string; description: string; amount: number }): string {
  return [
    "Hello Skavio Technologies, I have paid for a Skavio EduReports package.",
    o.schoolName ? `School: ${o.schoolName}` : null,
    `Order reference: ${o.reference}`,
    `Package: ${o.description}`,
    `Amount: UGX ${Math.round(o.amount).toLocaleString("en-US")}`,
    "I am attaching the transaction screenshot.",
  ].filter(Boolean).join("\n");
}

/** The message Skavio sends a school with its activation key. */
export function activationKeyText(o: { schoolName?: string | null; key: string; description: string; reference: string; expiresAt: string; activateUrl: string }): string {
  return [
    `Hello${o.schoolName ? ` ${o.schoolName}` : ""}, your payment for ${o.description} (order ${o.reference}) has been verified.`,
    `Your activation key: ${o.key}`,
    `Open ${o.activateUrl}, sign in as the school administrator and enter the key. It works once, only for your school, and expires on ${new Date(o.expiresAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`,
    "Thank you — Skavio Technologies",
  ].join("\n");
}

/** Keys are typed by hand: uppercase, strip spaces/dashes and the SKV prefix, map look-alikes (O→0, I/L→1). */
export function normaliseActivationKey(raw: string): string {
  let v = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (v.startsWith("SKV") && v.length === 28) v = v.slice(3);
  return v.replace(/O/g, "0").replace(/[IL]/g, "1");
}
export const looksLikeActivationKey = (raw: string) => normaliseActivationKey(raw).length === 25;

export function validateProofFile(file: File): string | null {
  if (!PROOF_TYPES.includes(file.type)) return "Attach a PNG, JPG, WEBP or PDF file.";
  if (file.size > PROOF_MAX_BYTES) return "The screenshot must be 5 MB or smaller.";
  return null;
}

export async function submitPaymentProof(o: { schoolId: string; paymentId: string; payerReference: string; payerPhone: string; file?: File | null }) {
  let path: string | null = null;
  if (o.file) {
    const problem = validateProofFile(o.file);
    if (problem) throw new Error(problem);
    const ext = (o.file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
    path = `${o.schoolId}/${o.paymentId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("payment-proofs").upload(path, o.file, { contentType: o.file.type, upsert: false });
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.rpc("billing_manual_submit_proof", {
    _payment_id: o.paymentId, _payer_reference: o.payerReference, _payer_phone: o.payerPhone, _proof_path: path as string,
  });
  if (error) throw new Error(error.message);
}

export interface ActivationResult { ok: boolean; error?: string; description?: string; reference?: string; product?: string }

export async function activateKey(key: string): Promise<ActivationResult> {
  const { data, error } = await supabase.rpc("billing_activate_key", { _key: key });
  if (error) return { ok: false, error: error.message };
  const r = data as unknown as ActivationResult;
  if (r.ok) announceEntitlementChange();
  return r;
}

const ENTITLEMENT_STORAGE_KEY = "skavio:entitlement-changed-at";

/** Refreshes package status and report locks in this tab and every other open tab of the app. */
export function announceEntitlementChange() {
  window.dispatchEvent(new Event(ENTITLEMENT_CHANGED));
  try { window.localStorage.setItem(ENTITLEMENT_STORAGE_KEY, String(Date.now())); } catch { /* private mode */ }
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === ENTITLEMENT_STORAGE_KEY) window.dispatchEvent(new Event(ENTITLEMENT_CHANGED)); });
}

export interface OpenOrder { id: string; reference: string; description: string; amount: number; review_status: ReviewStatus }

/** The school's package request still in progress, if any. */
export async function fetchOpenOrder(schoolId: string): Promise<OpenOrder | null> {
  const { data } = await supabase.from("billing_payments").select("id,reference,description,amount,review_status")
    .eq("school_id", schoolId).eq("channel", "manual").eq("status", "pending").in("review_status", OPEN_REVIEW_STATUSES)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data ? { ...(data as unknown as OpenOrder), amount: Number((data as { amount: number }).amount) } : null;
}

export async function cancelOrder(paymentId: string) {
  const { error } = await supabase.rpc("billing_manual_cancel_order", { _payment_id: paymentId });
  if (error) throw new Error(error.message);
}

export interface Entitlement {
  active: boolean;
  subscription: { plan: string; tier: string; capacity: number; expires_on: string; state: string; academic_year: number; term_number: number | null } | null;
  licence: { tier: string; capacity: number } | null;
  learner_balance: number;
}

export async function fetchEntitlement(): Promise<Entitlement> {
  const { data, error } = await supabase.rpc("billing_my_entitlement");
  if (error) throw error;
  const e = (data ?? {}) as Partial<Entitlement>;
  return { active: !!e.active, subscription: e.subscription ?? null, licence: e.licence ?? null, learner_balance: Number(e.learner_balance ?? 0) };
}
