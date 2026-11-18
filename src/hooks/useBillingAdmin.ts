import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** True for the school's administrators (and platform administrators); teachers and members never see billing. */
export function useBillingAdmin() {
  const { schoolId, isSuperAdmin, user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!user || !schoolId) { setAllowed(isSuperAdmin ? true : false); return; }
    supabase.rpc("is_school_billing_admin", { _school: schoolId }).then(({ data }) => {
      if (!cancelled) setAllowed(!!data);
    });
    return () => { cancelled = true; };
  }, [user, schoolId, isSuperAdmin]);
  return allowed;
}
