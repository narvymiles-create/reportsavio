/**
 * Default (built-in) report card preview for Template Management.
 *
 * The built-in renderers are called directly — never the custom-template
 * wrappers — so the preview always shows the school's own default design even
 * while a custom template is active. A real learner is used so the design
 * carries the school's logo, border style and grading scale.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentSchoolId, type TemplateLevel } from "@/lib/templates";
import { bytesToPdfBlob } from "./core";
import { primaryReportBytes } from "./primaryReport";
import { buildNurseryReportPdf } from "./nurseryReport";

export type TermCandidate = {
  id: string;
  name: string;
  is_current: boolean | null;
  created_at: string | null;
};

export type LearnerCandidate = { id: string; full_name: string; marks: number };

export type DefaultPreview = {
  blob: Blob;
  learnerName: string;
  termName: string;
  level: TemplateLevel;
};

/** The school's current term; the most recently added one when none is current. */
export function pickPreviewTerm<T extends TermCandidate>(terms: T[]): T | null {
  if (!terms.length) return null;
  const newest = [...terms].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return newest.find((t) => t.is_current === true) ?? newest[0];
}

/** The learner with the most recorded marks, so the preview shows a full card. */
export function pickPreviewLearner<T extends LearnerCandidate>(candidates: T[]): T | null {
  if (!candidates.length) return null;
  return [...candidates].sort(
    (a, b) => b.marks - a.marks || a.full_name.localeCompare(b.full_name),
  )[0];
}

async function markCounts(table: string, termId: string, schoolId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from(table as any)
    .select("learner_id")
    .eq("term_id", termId)
    .eq("school_id", schoolId)
    .limit(20000);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  ((data as { learner_id: string }[]) ?? []).forEach((row) => {
    counts.set(row.learner_id, (counts.get(row.learner_id) ?? 0) + 1);
  });
  return counts;
}

/** Renders the built-in report card for the school's current term. */
export async function renderDefaultTemplatePreview(level: TemplateLevel): Promise<DefaultPreview> {
  const schoolId = await currentSchoolId();

  const { data: termRows, error: termError } = await supabase
    .from("terms")
    .select("id,name,is_current,created_at")
    .eq("school_id", schoolId);
  if (termError) throw new Error(termError.message);
  const term = pickPreviewTerm(((termRows as TermCandidate[]) ?? []).filter((t) => !!t.id));
  if (!term) {
    throw new Error("Add a term first — the default report card needs a term to preview.");
  }

  const counts = await markCounts(level === "primary" ? "marks" : "nursery_assessments", term.id, schoolId);

  const { data: learnerRows, error: learnerError } = await supabase
    .from((level === "primary" ? "learners" : "nursery_learners") as any)
    .select("id,full_name,class_id")
    .eq("school_id", schoolId)
    .order("full_name");
  if (learnerError) throw new Error(learnerError.message);

  let rows = ((learnerRows as { id: string; full_name: string; class_id: string | null }[]) ?? []);
  // Primary subject grids need a class; the Nursery sheet does not.
  if (level === "primary") rows = rows.filter((r) => !!r.class_id);

  const learner = pickPreviewLearner(rows.map((r) => ({
    id: r.id, full_name: r.full_name, marks: counts.get(r.id) ?? 0,
  })));
  if (!learner) {
    throw new Error(level === "primary"
      ? "Add a learner to a class first — the default report card needs a learner to preview."
      : "Add a Nursery learner first — the default report card needs a learner to preview.");
  }

  const bytes = level === "primary"
    ? await primaryReportBytes(learner.id, term.id)
    : await (await buildNurseryReportPdf(learner.id, term.id)).save();

  return { blob: bytesToPdfBlob(bytes), learnerName: learner.full_name, termName: term.name, level };
}
