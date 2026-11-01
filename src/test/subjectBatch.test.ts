import { describe, it, expect } from "vitest";
import { planSubjectBatch } from "@/lib/subjectBatch";

const core = (class_id: string, code: string) => ({ class_id, code, code_label: null, name: code, is_core: true });

describe("planSubjectBatch", () => {
  it("skips classes that already have the subject", () => {
    const p = planSubjectBatch(["a", "b"], { code: "MTC", code_label: null, name: "Mathematics", is_core: false }, [core("a", "MTC")]);
    expect(p.skipped).toEqual(["a"]);
    expect(p.create.map((r) => r.class_id)).toEqual(["b"]);
  });
  it("adds as non-core when a class already has 4 core subjects", () => {
    const existing = ["ENG", "SCI", "SST", "RE"].map((c) => core("a", c));
    const p = planSubjectBatch(["a", "b"], { code: "MTC", code_label: null, name: "Mathematics", is_core: true }, existing);
    expect(p.create).toEqual([{ class_id: "a", is_core: false }, { class_id: "b", is_core: true }]);
    expect(p.nonCore).toEqual(["a"]);
  });
});
