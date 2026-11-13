import type { ReportDataSource } from "./reportDataSource";
import type { Level } from "./templateSections";
import { EXAM_IDS, EXAM_NAMES, type ExamId } from "./templateExams";

export type TestLearner = { id: string; school_id: string; full_name: string; class_id: string | null };
type TestTerm = { id: string; school_id: string; name: string; year: number; is_current: boolean };
type TestAssessment = { school_id: string; learner_id: string; term_id: string; subject_id?: string; learning_area_id?: string; bot?: number | null; mid?: number | null; eot?: number | null; grade?: string | null; comment?: string | null };
type TestSubject = { id: string; class_id?: string; school_id: string };
export type TestCandidate = { learner: TestLearner; term: TestTerm; academicYear: number };

/** Pure selection: only real, school-scoped learner/term pairs with configured assessment rows qualify. */
export function chooseTemplateTestLearner(schoolId: string, level: Level, learners: TestLearner[], terms: TestTerm[], assessments: TestAssessment[], subjects: TestSubject[], classes: { id: string; school_id: string }[], exams: ExamId[], year?: number, random: () => number = Math.random): TestCandidate {
  const scopedLearners = learners.filter(l => l.school_id === schoolId);
  const named = scopedLearners.filter(l => l.full_name.trim() && l.class_id && classes.some(c => c.school_id === schoolId && c.id === l.class_id));
  const scopedTerms = terms.filter(t => t.school_id === schoolId);
  if (!scopedLearners.length) throw new Error(`No ${level === "nursery" ? "Nursery" : "Primary"} learners are saved for this school. Add a learner and save assessment records before testing.`);
  if (!named.length) throw new Error("No suitable learner has both a saved name and a valid class in this school. Complete those learner details before testing.");
  if (!scopedTerms.length) throw new Error("This school has no saved terms. Add a term and save assessment records before testing.");
  if (!subjects.some(s => s.school_id === schoolId)) throw new Error(`This school has no configured ${level === "primary" ? "subjects" : "learning areas"}. Configure them and save assessment records before testing.`);
  const phases = exams.length ? exams : EXAM_IDS;
  const candidates: (TestCandidate & { score: number })[] = [];
  for (const learner of named) {
    const configured = new Set(subjects.filter(s => s.school_id === schoolId && (level === "nursery" || s.class_id === learner.class_id)).slice(0, level === "primary" ? 7 : undefined).map(s => s.id));
    for (const term of scopedTerms) {
      const rows = assessments.filter(a => a.school_id === schoolId && a.learner_id === learner.id && a.term_id === term.id && configured.has(level === "primary" ? a.subject_id ?? "" : a.learning_area_id ?? ""));
      const count = level === "primary" ? rows.reduce((n, a) => n + phases.filter(p => a[p] != null && Number.isFinite(Number(a[p]))).length, 0) : rows.filter(a => a.grade?.trim()).length;
      if (!count) continue;
      const completeness = count / Math.max(1, configured.size * (level === "primary" ? phases.length : 1));
      candidates.push({ learner, term, academicYear: year ?? term.year, score: completeness });
    }
  }
  if (!candidates.length) throw new Error(level === "primary"
    ? `No suitable Primary learner has saved marks for ${phases.map(p => EXAM_NAMES[p]).join(", ")} in the template's subjects. Save marks for a learner with a name and class before testing.`
    : "No suitable Nursery learner has saved assessment grades for this school's learning areas. Save assessments for a learner with a name and class before testing.");
  const best = Math.max(...candidates.map(c => c.score));
  const pool = candidates.filter(c => c.score === best);
  const selected = pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
  if (!selected) throw new Error("No suitable learner found.");
  return { learner: selected.learner, term: selected.term, academicYear: selected.academicYear };
}

export async function loadTemplateTestCandidate(source: ReportDataSource, level: Level, exams: ExamId[]): Promise<TestCandidate> {
  const [learners, terms, assessments, subjects, classes, years] = await Promise.all([
    source.read(level === "primary" ? "learners" : "nursery_learners"), source.read("terms"),
    source.read(level === "primary" ? "marks" : "nursery_assessments"),
    source.read(level === "primary" ? "subjects" : "nursery_learning_areas", { order: "sort_order" }),
    source.read(level === "primary" ? "classes" : "nursery_classes"), source.read("academic_years"),
  ]);
  return chooseTemplateTestLearner(source.schoolId, level, learners, terms, assessments, subjects, classes, exams, years.find(y => y.is_current)?.year);
}