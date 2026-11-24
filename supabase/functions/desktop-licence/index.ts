// Desktop edition licensing: public key for offline verification, controlled device
// activation/refresh (delivers upgraded certificates), and deactivation for transfer.
import { z } from "npm:zod@4.6.7";
import { adminClient, corsHeaders, ensureLicenceCertificate, getCaller, json, licencePublicKey, signDeviceCertificate } from "../_shared/billing/server.ts";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("public_key") }),
  z.object({
    action: z.literal("activate"),
    licence_key: z.string().trim().toUpperCase().regex(/^SER-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/),
    device_fingerprint: z.string().min(16).max(200),
    device_name: z.string().max(120).optional(),
  }),
  z.object({
    action: z.literal("deactivate"),
    device_id: z.string().uuid().optional(),
    licence_key: z.string().trim().toUpperCase().optional(),
    device_fingerprint: z.string().min(16).max(200).optional(),
  }),
  z.object({ action: z.literal("certificate"), licence_id: z.string().uuid() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = adminClient();
  try {
    if (req.method === "GET") return json({ algorithm: "Ed25519", public_key: await licencePublicKey(), token_prefix: "SERL1" });
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    if (body.action === "public_key") return json({ algorithm: "Ed25519", public_key: await licencePublicKey(), token_prefix: "SERL1" });

    if (body.action === "activate") {
      const { data: lic } = await admin.from("desktop_licences").select("*").eq("licence_key", body.licence_key).maybeSingle();
      if (!lic || lic.status !== "active") return json({ error: "Licence key not recognised" }, 404);
      const licenceCertificate = await ensureLicenceCertificate(admin, lic.id);
      const { data: existing } = await admin.from("desktop_licence_devices").select("*").eq("licence_id", lic.id)
        .eq("device_fingerprint", body.device_fingerprint).is("deactivated_at", null).maybeSingle();
      let deviceId = existing?.id as string | undefined;
      if (!deviceId) {
        const { count } = await admin.from("desktop_licence_devices").select("id", { count: "exact", head: true }).eq("licence_id", lic.id).is("deactivated_at", null);
        if ((count ?? 0) >= lic.max_devices) {
          return json({ error: `This licence is already active on ${count} computer(s). Deactivate one from Billing & Subscription to transfer it.` }, 409);
        }
        const { data: dev, error } = await admin.from("desktop_licence_devices").insert({
          licence_id: lic.id, school_id: lic.school_id, device_fingerprint: body.device_fingerprint, device_name: body.device_name ?? null,
        }).select("id").single();
        if (error) return json({ error: error.message }, 409);
        deviceId = dev.id;
      }
      const certificate = await signDeviceCertificate(admin, lic, body.device_fingerprint, body.device_name ?? existing?.device_name ?? null);
      await admin.from("desktop_licence_devices").update({ certificate, last_seen_at: new Date().toISOString(), device_name: body.device_name ?? existing?.device_name ?? null }).eq("id", deviceId);
      return json({ device_id: deviceId, certificate, licence_certificate: licenceCertificate, public_key: await licencePublicKey() });
    }

    if (body.action === "deactivate") {
      // From the desktop itself (licence key + fingerprint) or by a signed-in administrator.
      if (body.licence_key && body.device_fingerprint) {
        const { data: lic } = await admin.from("desktop_licences").select("id").eq("licence_key", body.licence_key).maybeSingle();
        if (!lic) return json({ error: "Licence key not recognised" }, 404);
        await admin.from("desktop_licence_devices").update({ deactivated_at: new Date().toISOString() })
          .eq("licence_id", lic.id).eq("device_fingerprint", body.device_fingerprint).is("deactivated_at", null);
        return json({ ok: true });
      }
      const caller = await getCaller(req, admin);
      if (!caller || !caller.isSchoolBillingAdmin) return json({ error: "Not authorised" }, 403);
      const { data: dev } = await admin.from("desktop_licence_devices").select("id, school_id").eq("id", body.device_id ?? "").maybeSingle();
      if (!dev || (!caller.isSuperAdmin && dev.school_id !== caller.schoolId)) return json({ error: "Device not found" }, 404);
      await admin.from("desktop_licence_devices").update({ deactivated_at: new Date().toISOString(), deactivated_by: caller.userId }).eq("id", dev.id);
      return json({ ok: true });
    }

    const caller = await getCaller(req, admin);
    if (!caller || !caller.isSchoolBillingAdmin) return json({ error: "Not authorised" }, 403);
    const { data: lic } = await admin.from("desktop_licences").select("id, school_id").eq("id", body.licence_id).maybeSingle();
    if (!lic || (!caller.isSuperAdmin && lic.school_id !== caller.schoolId)) return json({ error: "Licence not found" }, 404);
    return json({ certificate: await ensureLicenceCertificate(admin, lic.id), public_key: await licencePublicKey() });
  } catch (e) {
    console.error("desktop-licence error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
