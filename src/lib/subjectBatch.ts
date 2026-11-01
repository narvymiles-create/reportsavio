export type ExistingSubject = { class_id: string; code: string; code_label: string | null; name: string; is_core: boolean };
export type BatchInput = { code: string; code_label: string | null; name: string; is_core: boolean };

/** Plan a multi-class subject insert: skip classes that already have it; downgrade core when a class has 4 core subjects. */
export function planSubjectBatch(classIds: string[], input: BatchInput, existing: ExistingSubject[]) {
  const key = (code: string, label: string | null) => (code === "OTHER" ? `OTHER:${(label ?? "").toUpperCase()}` : code);
  const targetKey = key(input.code, input.code_label);
  const targetName = input.name.trim().toLowerCase();
  const create: { class_id: string; is_core: boolean }[] = [];
  const skipped: string[] = [];
  const nonCore: string[] = [];
  for (const classId of classIds) {
    const inClass = existing.filter((s) => s.class_id === classId);
    if (inClass.some((s) => key(s.code, s.code_label) === targetKey || s.name.trim().toLowerCase() === targetName)) {
      skipped.push(classId);
      continue;
    }
    let core = input.is_core;
    if (core && inClass.filter((s) => s.is_core).length >= 4) { core = false; nonCore.push(classId); }
    create.push({ class_id: classId, is_core: core });
  }
  return { create, skipped, nonCore };
}
