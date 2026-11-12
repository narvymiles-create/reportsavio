import { useEffect, useState } from "react";
import { getActiveTemplate, REPORT_TEMPLATE_CHANGED } from "@/lib/reportTemplates";
import { templateTextLines } from "@/lib/templateHeadings";
import { sectionMapOf, templateFieldNames } from "@/lib/pdf/customReport";
import { EXAM_IDS, templateExamSections, type ExamId } from "@/lib/templateExams";

/** Exams available for Primary marks entry. Without an active uploaded template every exam stays available. */
export function useTemplateExams() {
  const [state, setState] = useState<{ loading: boolean; available: ExamId[]; templateName: string | null }>({ loading: true, available: EXAM_IDS, templateName: null });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const t = await getActiveTemplate("primary");
        if (!t) { if (alive) setState({ loading: false, available: EXAM_IDS, templateName: null }); return; }
        const lines = await templateTextLines(t).catch(() => [] as string[]);
        const found = templateExamSections(templateFieldNames(t), sectionMapOf(t), lines);
        // A template with no recognisable exam table (e.g. unreadable scan) keeps every form open rather than blocking all marks entry.
        if (alive) setState({ loading: false, available: found.length ? found : EXAM_IDS, templateName: t.name });
      } catch { if (alive) setState({ loading: false, available: EXAM_IDS, templateName: null }); }
    };
    load();
    window.addEventListener(REPORT_TEMPLATE_CHANGED, load);
    return () => { alive = false; window.removeEventListener(REPORT_TEMPLATE_CHANGED, load); };
  }, []);
  return state;
}
