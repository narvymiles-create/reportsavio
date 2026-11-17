import { describe, expect, it } from "vitest";
import { parseCustomThemes, themeFromColours } from "./reportAppearance";
describe("custom themes", () => {
  it("keeps at most three colours", () => {
    expect(parseCustomThemes([{ name: "A", colours: ["#111111", "#eeeeee", "#222222", "#333333"] }])[0].colours).toHaveLength(3);
  });
  it("uses the main colour for headings and the third for text", () => {
    const t = themeFromColours(["#14532d", "#ecfdf5", "#222222"]);
    expect(t.schoolName).toBe("#14532d"); expect(t.columnBackground).toBe("#ecfdf5"); expect(t.tableText).toBe("#222222");
  });
});
