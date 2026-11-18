import { describe, expect, it } from "vitest";
import {
  SKAVIO_PAYMENT_NUMBER, SKAVIO_WHATSAPP, activationKeyText, looksLikeActivationKey, normaliseActivationKey, paymentConfirmationText,
  toWhatsAppNumber, validateProofFile, whatsappLink,
} from "@/lib/billing/manual";
import { resolvePreviewLock } from "@/lib/billing/previewLock";

describe("manual payments", () => {
  it("uses 0705466283 as the official payment number and its WhatsApp form", () => {
    expect(SKAVIO_PAYMENT_NUMBER).toBe("0705466283");
    expect(SKAVIO_WHATSAPP).toBe("256705466283");
  });

  it("turns Ugandan numbers into WhatsApp numbers and rejects others", () => {
    expect(toWhatsAppNumber("0772 123 456")).toBe("256772123456");
    expect(toWhatsAppNumber("+256 705 466283")).toBe("256705466283");
    expect(toWhatsAppNumber("4567890456789")).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
  });

  it("puts the order reference, package and amount in the school's WhatsApp message", () => {
    const text = paymentConfirmationText({ schoolName: "Bonga PS", reference: "SKV-ABCD2345", description: "50 learner(s)", amount: 25000 });
    expect(text).toContain("SKV-ABCD2345");
    expect(text).toContain("UGX 25,000");
    expect(whatsappLink(SKAVIO_WHATSAPP, text)).toMatch(/^https:\/\/wa\.me\/256705466283\?text=/);
  });

  it("includes the key and activation page in the admin's WhatsApp message", () => {
    const text = activationKeyText({ key: "SKV-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", description: "Termly", reference: "SKV-X", expiresAt: "2026-12-18T00:00:00Z", activateUrl: "https://skavioedureports.dev/activate" });
    expect(text).toContain("SKV-AAAAA-BBBBB-CCCCC-DDDDD-EEEEE");
    expect(text).toContain("https://skavioedureports.dev/activate");
  });
});

describe("activation key typing", () => {
  it("accepts keys with or without dashes, spaces, lower case and the SKV prefix", () => {
    const k = "SKV-7H2KQ-9MXPA-RT4VB-ZZ81C-0NWEF";
    expect(normaliseActivationKey(k)).toBe("7H2KQ9MXPART4VBZZ81C0NWEF");
    expect(normaliseActivationKey(" 7h2kq 9mxpa rt4vb zz81c 0nwef ")).toBe("7H2KQ9MXPART4VBZZ81C0NWEF");
    expect(looksLikeActivationKey(k)).toBe(true);
  });
  it("maps look-alike letters the way the database does (O→0, I/L→1)", () => {
    expect(normaliseActivationKey("SKV-OOOOO-IIIII-LLLLL-22222-33333")).toBe("0000011111111112222233333");
  });
  it("rejects keys of the wrong length", () => {
    expect(looksLikeActivationKey("SKV-12345")).toBe(false);
  });
});

describe("payment proof files", () => {
  const file = (type: string, size: number) => ({ type, size, name: "x" }) as unknown as File;
  it("allows images and PDFs up to 5 MB only", () => {
    expect(validateProofFile(file("image/png", 1000))).toBeNull();
    expect(validateProofFile(file("application/pdf", 5 * 1024 * 1024))).toBeNull();
    expect(validateProofFile(file("image/png", 5 * 1024 * 1024 + 1))).not.toBeNull();
    expect(validateProofFile(file("text/html", 10))).not.toBeNull();
  });
});

describe("unpaid preview lock", () => {
  it("locks previews with learner data for schools without an active package", () => {
    expect(resolvePreviewLock({ entitled: false })).toBe(true);
    expect(resolvePreviewLock({ entitled: true })).toBe(false);
  });
  it("waits (null) while the package is being checked, never showing an unlocked copy", () => {
    expect(resolvePreviewLock({ entitled: null })).toBeNull();
  });
  it("follows the per-card database answer when a page has one", () => {
    expect(resolvePreviewLock({ watermark: true, entitled: true })).toBe(true);
    expect(resolvePreviewLock({ watermark: false, entitled: false })).toBe(false);
  });
  it("unlocks only after the database allowed output, and never locks blank template artwork", () => {
    expect(resolvePreviewLock({ watermark: true, entitled: false, cleared: true })).toBe(false);
    expect(resolvePreviewLock({ sampleOnly: true, entitled: false })).toBe(false);
  });
});
