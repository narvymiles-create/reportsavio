import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ENTITLEMENT_CHANGED, fetchEntitlement, type Entitlement } from "@/lib/billing/manual";

const cache = new Map<string, Promise<Entitlement>>();
if (typeof window !== "undefined") window.addEventListener(ENTITLEMENT_CHANGED, () => cache.clear());

/**
 * The school's active package (subscription in term or renewal grace, or lifetime licence), checked in the
 * database. `active` is null while loading; anything that fails to load counts as not entitled.
 */
export function useSchoolEntitlement() {
  const { schoolId, user } = useAuth();
  const key = `${user?.id ?? ""}|${schoolId ?? ""}`;
  const [state, setState] = useState<{ key: string; value: Entitlement | null; failed?: boolean }>({ key: "", value: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(ENTITLEMENT_CHANGED, bump);
    return () => window.removeEventListener(ENTITLEMENT_CHANGED, bump);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!user) { setState({ key, value: null, failed: true }); return; }
    if (!cache.has(key)) cache.set(key, fetchEntitlement().catch((e) => { cache.delete(key); throw e; }));
    cache.get(key)!.then((value) => { if (!cancelled) setState({ key, value }); })
      .catch(() => { if (!cancelled) setState({ key, value: null, failed: true }); });
    return () => { cancelled = true; };
  }, [key, tick, user]);
  const current = state.key === key ? state : { value: null, failed: false };
  return { entitlement: current.value, active: current.failed ? false : current.value ? current.value.active : null };
}
