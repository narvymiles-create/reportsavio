import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBillingAdmin } from "@/hooks/useBillingAdmin";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Small top-of-page reminder for school administrators about expiry, capacity grace or low credits. */
export function BillingBanner() {
  const { schoolId } = useAuth();
  const isAdmin = useBillingAdmin();
  const { pathname } = useLocation();
  const [notice, setNotice] = useState<{ id: string; title: string; body: string; severity: string } | null>(null);

  useEffect(() => {
    if (!isAdmin || !schoolId) { setNotice(null); return; }
    supabase.from("billing_notifications").select("id,title,body,severity,kind")
      .eq("school_id", schoolId).is("read_at", null).neq("kind", "payment_received").in("severity", ["warning", "critical"])
      .order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => setNotice((data?.[0] as typeof notice) ?? null));
  }, [isAdmin, schoolId, pathname]);

  if (!notice || pathname === "/billing") return null;
  const dismiss = async () => {
    await supabase.from("billing_notifications").update({ read_at: new Date().toISOString() }).eq("id", notice.id);
    setNotice(null);
  };
  return (
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-md border p-3 text-sm ${notice.severity === "critical" ? "border-destructive/50 bg-destructive/10" : "bg-muted"}`}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1"><p className="font-medium">{notice.title}</p><p className="text-muted-foreground">{notice.body} <Link to="/billing" className="underline">Open Billing & Subscription</Link></p></div>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={dismiss} aria-label="Dismiss"><X className="h-4 w-4" /></Button>
    </div>
  );
}
