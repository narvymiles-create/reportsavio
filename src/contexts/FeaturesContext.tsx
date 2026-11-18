import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { FeatureKey } from "@/lib/features";

type FeaturesCtx = { features: Record<string, boolean>; loading: boolean; enabled: (key: FeatureKey) => boolean; refresh: () => Promise<void> };

const Ctx = createContext<FeaturesCtx>({ features: {}, loading: false, enabled: () => true, refresh: async () => {} });

/** Loads the platform feature switches that apply to the signed-in school (school override wins over the global default). */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { user, schoolId } = useAuth();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setFeatures({}); return; }
    setLoading(true);
    const { data } = await supabase.rpc("my_school_features");
    setFeatures(((data as Record<string, boolean> | null) ?? {}));
    setLoading(false);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh, schoolId]);
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("skavio:features-changed", onChange);
    return () => window.removeEventListener("skavio:features-changed", onChange);
  }, [refresh]);

  // Unknown or not-yet-loaded keys default to on; the database enforces the real switch.
  const enabled = useCallback((key: FeatureKey) => features[key] !== false, [features]);
  return <Ctx.Provider value={{ features, loading, enabled, refresh }}>{children}</Ctx.Provider>;
}

export const useFeatures = () => useContext(Ctx);
