import { supabase } from "@/integrations/supabase/client";
import { calculateDivision, computeTotal, gradeFor, type GradeBand } from "./grading";

type Audience = "class_teacher" | "head_teacher";
type Tpl = { audience: Audience; min_average: number; max_average: number; text: string };

export type LearnerSummary = {
  learner_id: string;
  total: number;
  average: number;
  aggregate: number;
};

export type GeneratedRow = LearnerSummary & {
  position: number;
  division: string;
  class_size: number;
  class_teacher_comment: string;
  head_teacher_comment: string;
};

function pickComment(tpls: Tpl[], audience: Audience, average: number, name: string): string {
  const matches = tpls.filter(t => t.audience === audience && average >= t.min_average && average <= t.max_average);
  if (matches.length === 0) return "";
  const t = matches[Math.floor(Math.random() * matches.length)];
  return t.text.split("{name}").join(name);
}

/** Compute & upsert report cards for every learner in a class for a given term.
 *  Returns the per-learner summaries with positions. */
export async function generateClassReports(termId: string, classId: string): Promise<GeneratedRow[]> {
  const [bandsRes, tplsRes, learnersRes, marksRes, subjectsRes] = await Promise.all([
    supabase.from("grading_scales").select("grade,points,min_mark,max_mark,remark").order("sort_order"),
    supabase.from("comment_templates").select("audience,min_average,max_average,text"),
    supabase.from("learners").select("id,full_name,class_id").eq("class_id", classId),
    supabase.from("marks").select("learner_id,subject_id,total,points").eq("term_id", termId),
    supabase.from("subjects").select("id,is_core").eq("class_id", classId),
  ]);

  const bands = (bandsRes.data ?? []) as GradeBand[];
  const tpls = (tplsRes.data ?? []) as Tpl[];
  const learners = (learnersRes.data ?? []) as { id: string; full_name: string }[];
  const subjectIds = new Set((subjectsRes.data ?? []).map((s: any) => s.id));
  const coreSubjectIds = new Set((subjectsRes.data ?? []).filter((s: any) => s.is_core).map((s: any) => s.id));
  if (coreSubjectIds.size !== 4) {
    throw new Error(`Exactly 4 core subjects are required to calculate aggregates. This class has ${coreSubjectIds.size}.`);
  }
  const marksByLearner = new Map<string, { subject_id: string; total: number | null; points: number | null }[]>();
  for (const m of (marksRes.data ?? []) as any[]) {
    if (!subjectIds.has(m.subject_id)) continue;
    const arr = marksByLearner.get(m.learner_id) ?? [];
    arr.push({ subject_id: m.subject_id, total: m.total, points: m.points });
    marksByLearner.set(m.learner_id, arr);
  }

  const summaries: (LearnerSummary & { name: string })[] = learners.map(l => {
    const ms = marksByLearner.get(l.id) ?? [];
    const totals = ms.map(m => m.total).filter((v): v is number => v != null);
    const total = totals.reduce((a, b) => a + b, 0);
    const average = totals.length ? Math.round((total / totals.length) * 100) / 100 : 0;
    // Aggregate: ONLY core subjects contribute
    const corePoints = ms
      .filter(m => coreSubjectIds.has(m.subject_id))
      .map(m => m.points)
      .filter((v): v is number => v != null);
    const aggregate = corePoints.reduce((a, b) => a + b, 0);
    return { learner_id: l.id, name: l.full_name, total, average, aggregate };
  });

  // Position: rank by total marks DESC; ties share position
  const sorted = [...summaries].sort((a, b) => b.total - a.total);
  const positionMap = new Map<string, number>();
  let lastTotal: number | null = null;
  let lastPos = 0;
  sorted.forEach((s, i) => {
    if (s.total !== lastTotal) { lastPos = i + 1; lastTotal = s.total; }
    positionMap.set(s.learner_id, lastPos);
  });

  const classSize = summaries.length;
  const rows: GeneratedRow[] = summaries.map(s => ({
    learner_id: s.learner_id,
    total: s.total,
    average: s.average,
    aggregate: s.aggregate,
    position: positionMap.get(s.learner_id) ?? classSize,
    class_size: classSize,
    division: calculateDivision(s.aggregate),
    class_teacher_comment: pickComment(tpls, "class_teacher", s.average, s.name),
    head_teacher_comment: pickComment(tpls, "head_teacher", s.average, s.name),
  }));

  // Upsert
  const payload = rows.map(r => ({
    term_id: termId,
    learner_id: r.learner_id,
    class_id: classId,
    total_marks: r.total,
    average: r.average,
    aggregate: r.aggregate,
    division: r.division,
    position: r.position,
    class_size: r.class_size,
    class_teacher_comment: r.class_teacher_comment,
    head_teacher_comment: r.head_teacher_comment,
    generated_at: new Date().toISOString(),
  }));

  if (payload.length) {
    const { error } = await supabase.from("report_cards").upsert(payload as any, { onConflict: "term_id,learner_id" });
    if (error) throw error;
  }
  return rows;
}

// Re-export so pages don't need a second import
export { computeTotal, gradeFor };
