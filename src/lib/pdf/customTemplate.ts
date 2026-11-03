/**
 * Renders a report card onto a school's uploaded custom template.
 *
 * The uploaded PDF is a fixed background canvas; only mapped fields are
 * stamped onto it through the shared pdf-lib template engine. When no active
 * custom template exists for the learner's level this returns null and the
 * caller falls back to the existing default report card.
 */
import { fillTemplate, loadTemplateBytes, type TplDef, type TplField, type ValueMap } from "./template/engine";
import { loadPrimaryData, computeAll, type PrimaryData } from "./primaryReport";
import { loadNurseryData, type NurseryData } from "./nurseryReport";
import {
  customKey,
  formatFieldValue,
  getActiveTemplate,
  isCustomKey,
  customIdFromKey,
  listCustomFields,
  listCustomValues,
  listMappings,
  resolveLearnerValue,
  resolveSchoolValue,
  templateFileUrl,
  type CustomField,
  type FieldMapping,
  type ReportTemplate,
  type TemplateLevel,
} from "@/lib/templates";

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

/** Converts saved mappings into the engine's field layout. */
export function mappingsToTplDef(template: Pick<ReportTemplate, "page_width" | "page_height">, mappings: FieldMapping[]): TplDef {
  const fields: TplField[] = mappings.map((m) => ({
    name: m.field_key,
    x: m.x,
    y: m.y,
    size: m.font_size,
    bold: false,
    italic: false,
    maxWidth: m.width,
    color: [0, 0, 0],
    box: [m.x, m.y, m.x + m.width, m.y + m.height],
    page: m.page,
  }));
  return { page: { width: template.page_width, height: template.page_height }, fields };
}

function primaryValues(d: PrimaryData): ValueMap {
  const c = computeAll(d);
  const s: Record<string, any> = d.school ?? {};
  const regValue = d.learner.active_reg_type === "REG" ? d.learner.reg_no
    : d.learner.active_reg_type === "INDEX" ? d.learner.index_no : d.learner.lin_no;
  const contacts = [
    s.tel ? `Tel: ${s.tel}` : "",
    s.email ? `Email: ${s.email}` : "",
    s.website ? `Web: ${s.website}` : "",
  ].filter(Boolean).join("   ");
  const eot = c.eot;
  return {
    school_name: (s.name ?? "").toUpperCase(),
    school_location: s.location ?? "",
    school_contacts: contacts,
    motto: s.motto ?? "",
    logo: { image: d.assets.logo, box: [0, 0, 0, 0], erase: false },
    photo: { image: d.assets.photo, box: [0, 0, 0, 0], erase: false },
    learner_name: d.learner.full_name ?? "",
    class: d.klass?.name ?? "",
    stream: d.stream?.name ?? "",
    section: d.learner.section ?? "",
    house: d.learner.house ?? "",
    age: d.learner.age != null ? String(d.learner.age) : "",
    sex: d.learner.sex ?? "",
    reg_no: String(regValue ?? ""),
    pay_code: d.learner.pay_code ?? "",
    term_name: d.term?.name ?? "",
    year: d.term?.year != null ? String(d.term.year) : "",
    total: eot.total ? String(eot.total) : "",
    average: eot.avg ? String(eot.avg) : "",
    aggregate: eot.aggregateText,
    division: eot.division,
    position: eot.position && eot.classSize ? `${eot.position}/${eot.classSize}` : "",
    conduct: d.learner.conduct ?? "",
    co_curricular: d.learner.co_curricular ?? "",
    class_teacher_comment: { text: d.report?.class_teacher_comment ?? "", maxLines: 4 },
    head_teacher_comment: { text: d.report?.head_teacher_comment ?? "", maxLines: 4 },
    class_teacher_name: (d.classTeacher?.full_name ?? "").toUpperCase(),
    head_teacher_name: (s.head_teacher_name ?? "").toUpperCase(),
    next_term_begins: fmtDate(d.term?.next_begins_on),
    term_ends: fmtDate(d.term?.ends_on ?? d.term?.end_date),
  };
}

function nurseryValues(d: NurseryData): ValueMap {
  const s: Record<string, any> = d.school ?? {};
  return {
    school_name: (s.name ?? "").toUpperCase(),
    motto: s.motto ?? "",
    logo: { image: d.assets.logo, box: [0, 0, 0, 0], erase: false },
    photo: { image: d.assets.photo, box: [0, 0, 0, 0], erase: false },
    learner_name: d.learner.full_name ?? "",
    class: d.cls?.name ?? "",
    stream: d.stream?.name ?? "",
    age: d.learner.age != null ? String(d.learner.age) : "",
    sex: d.learner.sex ?? "",
    pay_code: d.learner.pay_code ?? "",
    term_name: d.term?.name ?? "",
    year: d.term?.year != null ? String(d.term.year) : "",
    class_teacher_comment: { text: d.report.class_teacher_comment ?? "", maxLines: 4 },
    head_teacher_comment: { text: d.report.head_teacher_comment ?? "", maxLines: 4 },
    class_teacher_name: (d.classTeacher?.full_name ?? "").toUpperCase(),
    head_teacher_name: (s.nursery_head_teacher_name ?? s.head_teacher_name ?? "").toUpperCase(),
    next_term_begins: fmtDate(d.term?.next_begins_on),
    term_ends: fmtDate(d.term?.ends_on ?? d.term?.end_date),
  };
}

/** Stamps custom field values (school-wide and learner-specific) into the map. */
export function applyCustomValues(
  values: ValueMap,
  customFields: CustomField[],
  rows: { field_id: string; learner_id: string | null; term_id: string | null; value: string }[],
  learnerId: string,
  termId: string,
): void {
  for (const field of customFields) {
    const raw = field.scope === "school"
      ? resolveSchoolValue(rows, field.id)
      : resolveLearnerValue(rows, field.id, learnerId, termId);
    const text = formatFieldValue(raw, field.field_type);
    values[customKey(field.id)] = field.field_type === "multiline"
      ? { text, maxLines: 4 }
      : text;
  }
}

/**
 * Renders with the active custom template for the level, or returns null when
 * none is active (caller then uses the existing default report card).
 */
export async function renderWithCustomTemplate(
  level: TemplateLevel,
  learnerId: string,
  termId: string,
): Promise<Uint8Array | null> {
  const template = await getActiveTemplate(level);
  if (!template) return null;

  const [mappings, customFields] = await Promise.all([
    listMappings(template.id),
    listCustomFields(template.id),
  ]);
  const customRows = await listCustomValues(customFields.map((f) => f.id));

  const data = level === "primary"
    ? await loadPrimaryData(learnerId, termId)
    : await loadNurseryData(learnerId, termId);
  const values: ValueMap = level === "primary"
    ? primaryValues(data as PrimaryData)
    : nurseryValues(data as NurseryData);
  applyCustomValues(values, customFields, customRows, learnerId, termId);

  // Image boxes come from the mapping, not the value map.
  for (const m of mappings) {
    const v = values[m.field_key];
    if (v && typeof v === "object" && "image" in v) {
      v.box = [m.x, m.y, m.x + m.width, m.y + m.height];
    }
  }
  // Unmapped custom fields must not stamp anything.
  const mappedKeys = new Set(mappings.map((m) => m.field_key));
  for (const key of Object.keys(values)) {
    if (isCustomKey(key) && !mappedKeys.has(key)) delete values[key];
    if (isCustomKey(key)) {
      const field = customFields.find((f) => f.id === customIdFromKey(key));
      if (!field) delete values[key];
    }
  }

  const bytes = await loadTemplateBytes(await templateFileUrl(template));
  return fillTemplate(bytes, mappingsToTplDef(template, mappings), values);
}
