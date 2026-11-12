import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { associationValues } from "@/lib/reportCustomFields";

describe("matched system fields", () => {
  it("resolves a matched existing field through the same aliases as the template filler", () => {
    const data = { fields: [], values: [], associations: [{ id: "a", source_key: "learner.full.name", definition_id: null, pdf_field: "Name" }] } as never;
    const [a] = associationValues(data, { "learner.full.name": "Amina Okello", "academic.year": "2026" }, "l", "t");
    expect(a.value).toBe("Amina Okello");
  });
  it("leaves a matched field blank when the value does not exist", () => {
    const data = { fields: [], values: [], associations: [{ id: "a", source_key: "eot.division", definition_id: null, pdf_field: "Div" }] } as never;
    expect(associationValues(data, { "academic.year": "2026" }, "l", "t")[0].value).toBe("");
  });
});
