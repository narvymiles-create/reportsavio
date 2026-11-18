/**
 * Signed desktop licence certificates (Ed25519). The server signs; the desktop
 * edition verifies offline with the embedded public key. Uses only WebCrypto so
 * it runs in Deno, browsers, Electron/Tauri webviews and Node 20+.
 */
import { evaluateCapacity, type CapacityResult } from "./capacity.ts";

export const LICENCE_TOKEN_PREFIX = "SERL1";

export interface LicencePayload {
  v: 1;
  typ: "desktop-licence" | "device-activation";
  licenceId: string;
  licenceKey: string;
  schoolId: string;
  schoolName: string;
  tier: string;
  capacity: number;
  graceLimit: number;
  graceDays: number;
  version: number;
  issuedAt: string;
  maintenanceUntil?: string | null;
  deviceId?: string;
  deviceName?: string | null;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Uint8Array {
  const norm = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const PKCS8_ED25519_PREFIX = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

/** Derives the signing key pair from the secret seed text (SHA-256 → 32-byte Ed25519 seed). */
export async function keysFromSeed(seedText: string): Promise<{ privateKey: CryptoKey; publicKey: string }> {
  if (!seedText || seedText.length < 32) throw new Error("Licence signing seed is missing or too short");
  const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(seedText)));
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + 32);
  pkcs8.set(PKCS8_ED25519_PREFIX);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!jwk.x) throw new Error("Could not derive the licence public key");
  return { privateKey, publicKey: jwk.x };
}

export async function signLicence(payload: LicencePayload, privateKey: CryptoKey): Promise<string> {
  const body = enc.encode(canonicalJson(payload));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privateKey, body));
  return `${LICENCE_TOKEN_PREFIX}.${b64urlEncode(body)}.${b64urlEncode(sig)}`;
}

export interface VerifyResult { valid: boolean; payload?: LicencePayload; error?: string }

/** Offline verification with the public key (base64url raw 32 bytes). No network access. */
export async function verifyLicenceToken(token: string, publicKeyB64url: string): Promise<VerifyResult> {
  try {
    const [prefix, body, sig] = (token || "").trim().split(".");
    if (prefix !== LICENCE_TOKEN_PREFIX || !body || !sig) return { valid: false, error: "Malformed licence" };
    const key = await crypto.subtle.importKey("raw", b64urlDecode(publicKeyB64url) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    const bodyBytes = b64urlDecode(body);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64urlDecode(sig) as BufferSource, bodyBytes as BufferSource);
    if (!ok) return { valid: false, error: "Signature does not match" };
    const payload = JSON.parse(dec.decode(bodyBytes)) as LicencePayload;
    if (payload.v !== 1) return { valid: false, error: "Unsupported licence version" };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Invalid licence" };
  }
}

/** Locally persisted state kept by the desktop app (store it alongside the licence). */
export interface LocalLicenceState { lastSeenAt?: string | null; overSince?: string | null }

export interface OfflineEvaluation {
  valid: boolean;
  reason?: string;
  payload?: LicencePayload;
  capacity?: CapacityResult;
  clockRollback: boolean;
  nextState: LocalLicenceState;
}

/**
 * Full offline check for the desktop edition: signature, device binding, and the
 * 10% / 30-day capacity grace tracked with a monotonic "last seen" clock so turning
 * the computer's date back cannot extend the grace period. Lifetime licences never
 * expire; maintenance dates only affect updates/support.
 */
export async function evaluateOfflineLicence(args: {
  token: string;
  publicKey: string;
  deviceId?: string;
  activeLearners: number;
  state?: LocalLicenceState;
  now?: Date;
}): Promise<OfflineEvaluation> {
  const now = args.now ?? new Date();
  const state = args.state ?? {};
  const verified = await verifyLicenceToken(args.token, args.publicKey);
  if (!verified.valid || !verified.payload) {
    return { valid: false, reason: verified.error, clockRollback: false, nextState: state };
  }
  const payload = verified.payload;
  if (payload.typ === "device-activation" && args.deviceId && payload.deviceId !== args.deviceId) {
    return { valid: false, reason: "This licence is activated on a different computer", payload, clockRollback: false, nextState: state };
  }
  const lastSeen = state.lastSeenAt ? new Date(state.lastSeenAt) : null;
  const clockRollback = !!lastSeen && now.getTime() < lastSeen.getTime() - 86_400_000;
  const effectiveNow = lastSeen && lastSeen > now ? lastSeen : now;
  const capacity = evaluateCapacity({
    activeLearners: args.activeLearners,
    licensed: payload.capacity,
    graceLimit: payload.graceLimit,
    overSince: state.overSince ?? null,
    graceDays: payload.graceDays,
    now: effectiveNow,
  });
  return {
    valid: true,
    payload,
    capacity,
    clockRollback,
    nextState: { lastSeenAt: effectiveNow.toISOString(), overSince: capacity.overSince },
  };
}

/** Prefer the newest certificate (upgrades bump the version; older ones stay valid for their own capacity). */
export function pickNewestLicence(payloads: LicencePayload[]): LicencePayload | null {
  return payloads.reduce<LicencePayload | null>((best, p) => (!best || p.version > best.version ? p : best), null);
}
