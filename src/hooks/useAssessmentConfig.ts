import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_ASSESSMENT_CONFIG, normaliseConfig, PRIMARY_ASSESSMENT_KEY, type AssessmentConfig } from "@/lib/assessmentConfig";

export const ASSESSMENT_CONFIG_CHANGED = "assessment-config-changed";

/** The current school's Primary assessment configuration (defaults when none saved). */
export function useAssessmentConfig() {
  const { schoolId } = useAuth();
  const [state, setState] = useState<{ loading: boolean; config: AssessmentConfig }>({ loading: true, config: DEFAULT_ASSESSMENT_CONFIG });
  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    const load = () => supabase.from("system_settings").select("value").eq("school_id", schoolId).eq("key", PRIMARY_ASSESSMENT_KEY).maybeSingle()
      .then(({ data }) => { if (alive) setState({ loading: false, config: normaliseConfig(data?.value) }); });
    load();
    window.addEventListener(ASSESSMENT_CONFIG_CHANGED, load);
    return () => { alive = false; window.removeEventListener(ASSESSMENT_CONFIG_CHANGED, load); };
  }, [schoolId]);
  return state;
}
