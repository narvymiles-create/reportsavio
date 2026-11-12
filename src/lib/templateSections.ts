/**
 * Rule-based (non-AI) recognition of uploaded report-card labels and complete report sections.
 * Sections mirror the existing default Primary and Nursery report cards; values come from the
 * same loaders and calculations (see customReportData), keyed by section, row and column.
 */
import { FIELD_ALIASES } from "./pdf/template/forms";
import { IMAGE_FIELDS } from "./pdf/template/decorations";

export type Level = "primary" | "nursery";
export type ColumnId = "subject" | "code" | "marks" | "grade" | "points" | "remark" | "full" | "initials" | "range" | "rating" | "total" | "average" | "aggregate" | "division" | "position" | "class.size";
export type Section = { id: string; label: string; table: boolean; columns?: ColumnId[] };

export const COLUMN_LABELS: Record<ColumnId, string> = {
  subject: "Subject / Learning area", code: "Subject code", marks: "Marks / Score", grade: "Grade", points: "Points", remark: "Remarks / Comment",
  full: "Full marks", initials: "Teacher initials", range: "Mark range", rating: "Performance rating", total: "Total", average: "Average",
  aggregate: "Aggregates", division: "Division", position: "Position", "class.size": "Class size",
};
const EXAM: ColumnId[] = ["subject", "code", "full", "marks", "grade", "points", "remark", "initials"];
const GENERAL = (teacher: string): Section[] => [
  { id: "school", label: "School Information", table: false },
  { id: "learner", label: "Learner Information", table: false },
  { id: "attendance", label: "Attendance", table: false },
  { id: "conduct", label: "Conduct and Behaviour", table: false },
  { id: "class.comment", label: teacher, table: false },
  { id: "head.comment", label: "Headteacher's Comment", table: false },
  { id: "term.ends", label: "Term Ends On", table: false },
  { id: "next.term", label: "Next Term Begins", table: false },
  { id: "signatures", label: "Teacher and Headteacher Names/Signatures", table: false },
];
export const SECTIONS: Record<Level, Section[]> = {
  primary: [
    { id: "bot", label: "Beginning of Term Examination Results", table: true, columns: EXAM },
    { id: "mid", label: "Mid Term Examination Results", table: true, columns: EXAM },
    { id: "eot", label: "End of Term Examination Results", table: true, columns: EXAM },
    { id: "grading", label: "School Grading System", table: true, columns: ["grade", "range", "points", "remark"] },
    ...GENERAL("Class Teacher's Comment"),
  ],
  // Matches the default Nursery card: one term assessment of the school's learning areas, rated with its grade key.
  nursery: [
    { id: "assessment", label: "Learning Areas Assessment", table: true, columns: ["subject", "grade", "rating", "remark"] },
    { id: "key", label: "Assessment Key", table: true, columns: ["grade", "rating"] },
    ...GENERAL("Teacher's Comment"),
  ],
};
export const sectionLabel = (level: Level, id: string | null | undefined) => SECTIONS[level].find(s => s.id === id)?.label ?? "";
export const tableSections = (level: Level) => SECTIONS[level].filter(s => s.table);

/** Lower-case words; apostrophes removed and common phrasings collapsed. */
export function words(text: string) {
  return ` ${text.toLowerCase().replace(/['’`]s\b/g, "").replace(/['’`]/g, "").replace(/&/g, " and ")
    .replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9]+/g, " ").trim()} `
    .replace(/ b o t | beginning of term | beginning term | begin of term | start of term | beginning /g, " bot ")
    .replace(/ m o t | mid of term | mid term | midterm | middle of term | mid /g, " mid ")
    .replace(/ e o t | end of term | end term | final term | final /g, " eot ")
    .replace(/ head teacher | head master | head mistress | headmaster | headmistress | principal /g, " headteacher ")
    .replace(/ class teacher /g, " classteacher ").replace(/ teacher /g, " classteacher ")
    .replace(/\s+/g, " ");
}
const has = (w: string, ...terms: string[]) => terms.some(t => w.includes(` ${t} `));

/** Recognise a printed heading (e.g. "Mid-term Performance Record") as an existing section. */
export function recogniseHeading(text: string, level: Level): string | null {
  const w = words(text);
  const tableWord = has(w, "results", "result", "performance", "record", "records", "assessment", "assessments", "examination", "examinations", "exam", "exams", "test", "tests", "marks", "progress", "report");
  if (level === "primary") {
    for (const phase of ["bot", "mid", "eot"]) if (has(w, phase) && tableWord && !has(w, "ends", "begins", "date", "closes")) return phase;
    if (has(w, "grading", "grade key", "grading key", "grading scale", "grades")) return "grading";
  } else {
    if (has(w, "key", "rating", "ratings", "grading", "colour", "color")) return "key";
    if (has(w, "learning areas", "learning area", "assessment", "performance", "progress", "development")) return "assessment";
  }
  if (has(w, "attendance", "days present", "times present")) return "attendance";
  if (has(w, "conduct", "behaviour", "behavior", "discipline")) return "conduct";
  if (has(w, "headteacher") && has(w, "comment", "comments", "remark", "remarks", "report")) return "head.comment";
  if (has(w, "classteacher") && has(w, "comment", "comments", "remark", "remarks", "report")) return "class.comment";
  if (has(w, "next term", "next term begins", "term begins", "reopening", "school reopens")) return "next.term";
  if (has(w, "term ends", "ends on", "closing date", "term closes")) return "term.ends";
  if (has(w, "signature", "signatures", "sign")) return "signatures";
  if (has(w, "learner information", "pupil information", "student information", "learner details", "pupil details", "personal details", "bio data")) return "learner";
  if (has(w, "school information", "school details")) return "school";
  return null;
}
/** Text that looks like a table heading but is not recognised must be confirmed by an administrator. */
export const looksLikeTableHeading = (text: string) => text.length <= 80 && has(words(text), "results", "performance", "record", "assessment", "examination", "exam", "grading", "progress");

/** Predefined general label variations → existing data keys (normalised exact matches only). */
const GENERAL_ALIASES: Record<string, string> = {
  "learner name": "learner.full.name", "pupil name": "learner.full.name", "student name": "learner.full.name", "name of learner": "learner.full.name", "name of pupil": "learner.full.name", "name of student": "learner.full.name", "child name": "learner.full.name", "name": "learner.full.name", "full name": "learner.full.name", "names": "learner.full.name",
  "admission number": "learner.reg.no", "admission no": "learner.reg.no", "adm no": "learner.reg.no", "registration number": "learner.reg.no", "reg no": "learner.reg.no", "reg number": "learner.reg.no",
  "lin": "learner.lin.no", "lin no": "learner.lin.no", "lin number": "learner.lin.no", "index no": "learner.index.no", "index number": "learner.index.no", "pay code": "learner.pay.code", "paycode": "learner.pay.code",
  "school year": "academic.year", "academic year": "academic.year", "year": "academic.year", "year of study": "academic.year",
  "term": "term.name", "term of study": "term.name", "current term": "term.name",
  "class": "class.name", "grade level": "class.name", "class name": "class.name", "stream": "stream.name", "age": "learner.age", "sex": "learner.sex", "gender": "learner.sex", "house": "learner.house", "section": "learner.section",
  "date of birth": "learner.dob", "dob": "learner.dob",
  "school name": "school.name", "school": "school.name", "motto": "school.motto", "school motto": "school.motto", "location": "school.location", "address": "school.location", "tel": "school.tel", "telephone": "school.tel", "phone": "school.tel", "email": "school.email", "website": "school.website", "p o box": "school.po.box", "po box": "school.po.box", "box": "school.po.box",
  "attendance": "attendance", "days present": "attendance",
  "conduct": "learner.conduct", "behaviour": "learner.conduct", "conduct and behaviour": "learner.conduct", "learner conduct and behaviour": "learner.conduct", "discipline": "learner.conduct", "co curricular": "learner.co.curricular", "co curricular activities": "learner.co.curricular",
  "classteacher comment": "report.class.teacher.comment", "classteacher comments": "report.class.teacher.comment", "classteacher remarks": "report.class.teacher.comment", "classteacher remark": "report.class.teacher.comment",
  "headteacher comment": "report.head.teacher.comment", "headteacher comments": "report.head.teacher.comment", "headteacher remarks": "report.head.teacher.comment", "headteacher remark": "report.head.teacher.comment",
  "classteacher": "class.teacher.name", "classteacher name": "class.teacher.name", "headteacher": "head.teacher.name", "headteacher name": "head.teacher.name",
  "term ends": "term.ends.on", "term ends on": "term.ends.on", "ends on": "term.ends.on", "next term begins": "term.next.begins.on", "next term begins on": "term.next.begins.on", "next term": "term.next.begins.on", "next term starts": "term.next.begins.on", "school reopens": "term.next.begins.on",
  "position": "eot.position", "class size": "eot.class.size", "out of": "eot.class.size", "total": "eot.total", "total marks": "eot.total", "average": "eot.average", "aggregate": "eot.aggregate", "aggregates": "eot.aggregate", "division": "eot.division",
};
const SOURCE_SECTION = (source: string): string => source.startsWith("school.") ? "school" : source === "attendance" ? "attendance" : source === "learner.conduct" || source === "learner.co.curricular" ? "conduct"
  : source === "report.class.teacher.comment" ? "class.comment" : source === "report.head.teacher.comment" ? "head.comment" : source === "term.ends.on" ? "term.ends" : source === "term.next.begins.on" ? "next.term"
  : source.endsWith("teacher.name") ? "signatures" : /^(bot|mid|eot)\./.test(source) ? source.split(".")[0] : "learner";

const COLUMN_WORDS: [ColumnId, string[]][] = [
  ["full", ["full marks", "full mark", "out of", "max marks", "maximum", "max", "fm"]], ["class.size", ["class size", "out of class"]],
  ["initials", ["initials", "initial", "init", "sign", "signature", "classteacher"]], ["subject", ["subject", "subjects", "learning area", "learning areas", "area", "areas", "competence", "subject name"]],
  ["code", ["code"]], ["remark", ["remark", "remarks", "comment", "comments", "descriptor"]], ["points", ["points", "point", "pts"]],
  ["rating", ["rating", "performance", "level", "label"]], ["grade", ["grade", "grades", "gr"]], ["range", ["range", "marks range", "mark range"]],
  ["marks", ["marks", "mark", "score", "scores", "result", "results", "mks"]], ["total", ["total", "totals", "total marks"]], ["average", ["average", "avg", "mean"]],
  ["aggregate", ["aggregate", "aggregates", "agg"]], ["division", ["division", "div"]], ["position", ["position", "pos"]],
];
const SUMMARY: ColumnId[] = ["total", "average", "aggregate", "division", "position", "class.size"];

export type SectionMap = { groups?: Record<string, string>; headings?: Record<string, string>; tables?: StaticTable[] };
export type StaticTable = { id: string; section: string; page: number; x: number; y: number; width: number; height: number; rows: number; columns: ColumnId[]; header: boolean };
export type Recognised =
  | { kind: "general"; section: string; source: string }
  | { kind: "image"; section: string; source: string }
  | { kind: "cell"; section: string; row: number; column: ColumnId }
  | { kind: "summary"; section: string; column: ColumnId }
  | { kind: "unassigned"; group: string; row: number | null; column: ColumnId }
  | { kind: "unrecognised" };

/** Recognise one template label/field name. Never guesses an uncertain table section. */
export function recogniseField(name: string, level: Level, map: SectionMap = {}): Recognised {
  const dotted = name.trim().toLowerCase().replace(/[\s_-]+/g, ".").replace(/[^a-z0-9.]+/g, "").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  if (IMAGE_FIELDS[dotted]) return { kind: "image", section: IMAGE_FIELDS[dotted] === "logo" || IMAGE_FIELDS[dotted] === "stamp" ? "school" : IMAGE_FIELDS[dotted] === "photo" ? "learner" : "signatures", source: IMAGE_FIELDS[dotted] };
  const w = words(name);
  const plain = w.trim();
  const numbers = plain.split(" ").filter(t => /^\d+$/.test(t));
  const row = numbers.length ? Number(numbers[numbers.length - 1]) : null;
  const phases = (["bot", "mid", "eot"] as const).filter(p => has(w, p));
  const isNurseryArea = level === "nursery" && has(w, "learning area", "area", "areas");
  let column: ColumnId | null = null;
  for (const [id, terms] of COLUMN_WORDS) if (has(w, ...terms)) { column = id; break; }
  if (row != null && row > 0 && column) {
    let section: string | null = null;
    if (level === "primary") section = phases.length === 1 ? phases[0] : has(w, "grading", "scale", "band") ? "grading" : null;
    else section = has(w, "key", "colour", "color") ? "key" : isNurseryArea || column === "subject" || column === "remark" ? "assessment" : null;
    if (level === "nursery" && column === "marks") column = "grade";
    if (level === "nursery" && column === "initials") return { kind: "unrecognised" };
    const group = plain.split(" ").filter(t => !/^\d+$/.test(t) && !COLUMN_WORDS.some(([, terms]) => terms.includes(t))).join(" ") || "table";
    if (!section && map.groups?.[group]) section = map.groups[group];
    if (!section) return { kind: "unassigned", group, row, column };
    if (!SECTIONS[level].some(s => s.id === section && s.columns?.includes(column!) )) return { kind: "unrecognised" };
    return { kind: "cell", section, row, column };
  }
  if (level === "primary" && phases.length === 1 && column && SUMMARY.includes(column)) return { kind: "summary", section: phases[0], column };
  const key = plain.replace(/ \d+$/, "");
  const source = GENERAL_ALIASES[key] ?? FIELD_ALIASES[dotted] ?? (/^(school|learner|term|class|stream|report)\./.test(dotted) ? dotted : null);
  if (source && (level === "primary" || !/^(bot|mid|eot)\./.test(source))) return { kind: "general", section: SOURCE_SECTION(source), source };
  return { kind: "unrecognised" };
}

/** Key in the flattened report data for a recognised field. */
export const valueKey = (r: Recognised) => r.kind === "general" ? r.source : r.kind === "cell" ? `table.${r.section}.${r.row}.${r.column}` : r.kind === "summary" ? `table.${r.section}.${r.column}` : null;

export type RecognitionSummary = { sections: { id: string; label: string; fields: number }[]; unassigned: { group: string; fields: string[] }[]; unrecognised: string[] };
export function summariseRecognition(level: Level, names: string[], map: SectionMap = {}, headings: string[] = []): RecognitionSummary {
  const counts = new Map<string, number>(); const groups = new Map<string, string[]>(); const unrecognised: string[] = [];
  for (const name of names) {
    const r = recogniseField(name, level, map);
    if (r.kind === "unrecognised") unrecognised.push(name);
    else if (r.kind === "unassigned") groups.set(r.group, [...(groups.get(r.group) ?? []), name]);
    else counts.set(r.section, (counts.get(r.section) ?? 0) + 1);
  }
  for (const t of map.tables ?? []) counts.set(t.section, (counts.get(t.section) ?? 0) + t.rows * t.columns.length);
  for (const h of headings) { const s = map.headings?.[h] ?? recogniseHeading(h, level); if (s && s !== "none" && !counts.has(s)) counts.set(s, 0); }
  return {
    sections: SECTIONS[level].filter(s => counts.has(s.id)).map(s => ({ id: s.id, label: s.label, fields: counts.get(s.id) ?? 0 })),
    unassigned: [...groups].map(([group, fields]) => ({ group, fields })), unrecognised,
  };
}
