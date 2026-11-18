/**
 * IntesaPay Machine API client and webhook verification, following
 * https://intesapay.io/docs (setup, checkout, collect, webhooks, refunds).
 * Runtime-neutral: uses fetch + WebCrypto only.
 */
export const INTESAPAY_TEST_BASE_URL = "https://api-test.intesapay.io";

export interface IntesaPayment {
  reference: string;
  merchantReference?: string | null;
  externalMerchantId?: string | null;
  direction?: string | null;
  channel?: string | null;
  status: string;
  mode?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  msisdn?: string | null;
  provider?: string | null;
  failureMessage?: string | null;
  completedAt?: string | null;
}

export interface IntesaCheckoutSession {
  id: string;
  status?: string | null;
  url?: string | null;
  amount?: number | null;
  currency?: string | null;
  paymentReference?: string | null;
  payment?: { reference?: string | null; status?: string | null } | null;
  expiresAt?: string | null;
}

export class IntesaPayError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export class IntesaPayClient {
  constructor(private baseUrl: string, private apiKey: string, public accountId: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  get mode(): "TEST" | "LIVE" {
    return /api-test\./.test(this.baseUrl) ? "TEST" : "LIVE";
  }

  private async request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { "X-API-Key": this.apiKey, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!res.ok) {
      const code = json?.code ?? json?.error ?? undefined;
      const message = json?.message ?? json?.failureMessage ?? (text ? text.slice(0, 200) : res.statusText);
      throw new IntesaPayError(`IntesaPay ${res.status}${code ? ` ${code}` : ""}: ${message}`, res.status, code);
    }
    return json as T;
  }

  createCheckoutSession(input: {
    reference: string; amount: number; description: string; successUrl: string; cancelUrl: string;
    customerEmail?: string | null; customerName?: string | null; expiresInMinutes?: number;
  }) {
    return this.request<IntesaCheckoutSession>("POST", "/api/v1/checkout/sessions", {
      externalMerchantId: this.accountId,
      amount: input.amount,
      currency: "UGX",
      description: input.description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail ?? undefined,
      customerName: input.customerName ?? undefined,
      expiresInMinutes: input.expiresInMinutes ?? 60,
    }, input.reference);
  }

  collectMobileMoney(input: { reference: string; amount: number; msisdn: string; description: string; customerName?: string | null }) {
    return this.request<IntesaPayment>("POST", "/api/v1/payments/mobile-money/collect", {
      externalMerchantId: this.accountId,
      amount: input.amount,
      currency: "UGX",
      msisdn: input.msisdn,
      customerName: input.customerName ?? undefined,
      description: input.description,
    }, input.reference);
  }

  getPayment(reference: string) {
    return this.request<IntesaPayment>("GET", `/api/v1/payments/${encodeURIComponent(reference)}`);
  }

  getCheckoutSession(id: string) {
    return this.request<IntesaCheckoutSession>("GET", `/api/v1/checkout/sessions/${encodeURIComponent(id)}`);
  }

  refund(reference: string, refundAmount: number) {
    return this.request<IntesaPayment>("POST", `/api/v1/payments/${encodeURIComponent(reference)}/refund`, { refundAmount });
  }
}

const enc = new TextEncoder();

/** Verifies `IntesaPay-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256(secret, `${t}.${rawBody}`). */
export async function verifyIntesaSignature(secret: string, header: string | null, rawBody: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): Promise<boolean> {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2)).filter((p) => p.length === 2));
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.toLowerCase().charCodeAt(i);
  return diff === 0;
}

/** Normalises Ugandan mobile numbers to E.164 (+2567XXXXXXXX); returns null when invalid. */
export function normaliseUgandaMsisdn(input: string): string | null {
  const digits = (input || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  let local: string | null = null;
  if (/^2567\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^07\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^7\d{8}$/.test(digits)) local = digits;
  return local ? `+256${local}` : null;
}

/** Best-effort network label for display only; IntesaPay routes the prompt itself. */
export function ugandaNetwork(msisdn: string): "MTN" | "Airtel" | "Other" {
  const prefix = msisdn.replace(/^\+256/, "").slice(0, 2);
  if (["76", "77", "78", "79"].includes(prefix)) return "MTN";
  if (["70", "74", "75"].includes(prefix)) return "Airtel";
  return "Other";
}
