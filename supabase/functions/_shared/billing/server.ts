// Deno-only helpers shared by the billing edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { IntesaPayClient, INTESAPAY_TEST_BASE_URL, type IntesaPayment } from "./intesapay.ts";
import { keysFromSeed, signLicence, type LicencePayload } from "./licence.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const adminClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

export interface Caller {
  userId: string;
  email: string | null;
  isSuperAdmin: boolean;
  schoolId: string | null;
  isSchoolBillingAdmin: boolean;
}

/** Validates the signed-in user's token and resolves their school and billing permissions server-side. */
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const uid = data.user.id;
  const [{ data: roles }, { data: membership }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", uid),
    admin.from("school_members").select("school_id, role").eq("user_id", uid).eq("is_primary", true).maybeSingle(),
  ]);
  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  const isSuperAdmin = roleList.includes("super_admin");
  const schoolId = (membership as { school_id?: string } | null)?.school_id ?? null;
  const isSchoolBillingAdmin = isSuperAdmin || (roleList.includes("admin") && (membership as { role?: string } | null)?.role === "school_admin");
  return { userId: uid, email: data.user.email ?? null, isSuperAdmin, schoolId, isSchoolBillingAdmin };
}

export function intesaClient(): IntesaPayClient | null {
  const apiKey = Deno.env.get("INTESAPAY_API_KEY");
  const accountId = Deno.env.get("INTESAPAY_ACCOUNT_ID");
  if (!apiKey || !accountId) return null;
  return new IntesaPayClient(Deno.env.get("INTESAPAY_BASE_URL") || INTESAPAY_TEST_BASE_URL, apiKey, accountId);
}

export interface PaymentRow {
  id: string; school_id: string; reference: string; product: string; amount: number; status: string;
  channel: string | null; gateway_reference: string | null; checkout_session_id: string | null; details: Record<string, unknown>;
}

/**
 * Asks IntesaPay for the authoritative status (GET /payments/{reference}, via the
 * checkout session when needed) and applies it through the idempotent database
 * fulfilment. Browser redirects and webhook bodies are never trusted on their own.
 */
export async function syncPayment(admin: SupabaseClient, client: IntesaPayClient, payment: PaymentRow, knownReference?: string) {
  let gatewayRef = payment.gateway_reference ?? knownReference ?? null;
  if (!gatewayRef && payment.checkout_session_id) {
    const session = await client.getCheckoutSession(payment.checkout_session_id);
    gatewayRef = session.paymentReference ?? session.payment?.reference ?? null;
    if (!gatewayRef) {
      const expired = session.expiresAt && new Date(session.expiresAt).getTime() < Date.now();
      if (expired || /expired|cancel/i.test(session.status ?? "")) {
        await admin.rpc("billing_fulfil_payment", { _payment_id: payment.id, _status: "CANCELLED", _amount: null, _currency: null, _gateway_reference: null, _provider: null, _mode: client.mode, _failure: "Checkout session expired without payment" });
        return { result: "cancelled" };
      }
      await admin.from("billing_payments").update({ last_checked_at: new Date().toISOString() }).eq("id", payment.id);
      return { result: "pending" };
    }
  }
  if (!gatewayRef) return { result: "pending" };
  const gp: IntesaPayment = await client.getPayment(gatewayRef);
  if (gp.externalMerchantId && gp.externalMerchantId !== client.accountId) {
    throw new Error("Payment belongs to a different merchant account");
  }
  if (payment.channel === "mobile_money" && gp.merchantReference && gp.merchantReference !== payment.reference) {
    throw new Error("Payment reference does not match");
  }
  const { data, error } = await admin.rpc("billing_fulfil_payment", {
    _payment_id: payment.id,
    _status: gp.status,
    _amount: gp.amount === null || gp.amount === undefined ? null : Number(gp.amount),
    _currency: gp.currency ?? null,
    _gateway_reference: gp.reference ?? gatewayRef,
    _provider: gp.provider ?? null,
    _mode: gp.mode ?? client.mode,
    _failure: gp.failureMessage ?? null,
  });
  if (error) throw new Error(error.message);
  const result = data as { result: string; licence_id?: string | null };
  if (["fulfilled", "already_fulfilled"].includes(result.result) && ["desktop_licence", "desktop_upgrade"].includes(payment.product)) {
    const licenceId = result.licence_id ?? (payment.details?.licence_id as string | undefined);
    if (licenceId) await ensureLicenceCertificate(admin, licenceId);
  }
  return { ...result, gateway_status: gp.status };
}

async function signingKey() {
  return keysFromSeed(Deno.env.get("LICENCE_SIGNING_SEED") ?? "");
}

export async function licencePublicKey() {
  return (await signingKey()).publicKey;
}

interface LicenceRow {
  id: string; school_id: string; licence_key: string; tier: string; capacity: number; grace_limit: number;
  version: number; status: string; maintenance_until: string | null; certificate: string | null; certificate_version: number | null; max_devices: number;
}

export async function licencePayload(admin: SupabaseClient, lic: LicenceRow, extra: Partial<LicencePayload> = {}): Promise<LicencePayload> {
  const [{ data: school }, { data: settings }] = await Promise.all([
    admin.from("schools").select("name").eq("id", lic.school_id).single(),
    admin.from("billing_settings").select("capacity_grace_days").eq("id", 1).single(),
  ]);
  return {
    v: 1, typ: "desktop-licence", licenceId: lic.id, licenceKey: lic.licence_key, schoolId: lic.school_id,
    schoolName: (school as { name?: string } | null)?.name ?? "", tier: lic.tier, capacity: lic.capacity, graceLimit: lic.grace_limit,
    graceDays: (settings as { capacity_grace_days?: number } | null)?.capacity_grace_days ?? 30, version: lic.version,
    issuedAt: new Date().toISOString(), maintenanceUntil: lic.maintenance_until, ...extra,
  };
}

/** Issues (or re-issues after an upgrade) the signed licence certificate. Older certificates stay valid. */
export async function ensureLicenceCertificate(admin: SupabaseClient, licenceId: string): Promise<string | null> {
  const { data: lic } = await admin.from("desktop_licences").select("*").eq("id", licenceId).maybeSingle();
  if (!lic) return null;
  const row = lic as LicenceRow;
  if (row.certificate && row.certificate_version === row.version) return row.certificate;
  const { privateKey } = await signingKey();
  const token = await signLicence(await licencePayload(admin, row), privateKey);
  await admin.from("desktop_licences").update({ certificate: token, certificate_version: row.version }).eq("id", row.id);
  return token;
}

export async function signDeviceCertificate(admin: SupabaseClient, lic: LicenceRow, deviceId: string, deviceName: string | null) {
  const { privateKey } = await signingKey();
  return signLicence(await licencePayload(admin, lic, { typ: "device-activation", deviceId, deviceName }), privateKey);
}

export const ALLOWED_RETURN_ORIGIN = /^https:\/\/((www\.)?skavioedureports\.dev|[a-z0-9-]+\.lovable\.app|[a-z0-9-]+\.lovableproject\.com)$|^http:\/\/localhost(:\d+)?$/;
