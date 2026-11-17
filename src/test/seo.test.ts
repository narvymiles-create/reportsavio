import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PUBLIC_PAGES, PUBLIC_PATHS, isValidGa4Id } from "@/lib/seo";
import { buildSitemap } from "@/lib/sitemap";

describe("SEO", () => {
  it("sitemap file matches the public pages", () => {
    expect(readFileSync("public/sitemap.xml", "utf8")).toBe(buildSitemap());
  });
  it("private routes are never public", () => {
    for (const p of ["/auth", "/learners", "/report-cards", "/print/bulk/a/b", "/nursery/reports"]) expect(PUBLIC_PATHS.has(p)).toBe(false);
    expect(buildSitemap()).not.toMatch(/\/(learners|print|auth|report-cards)\b/);
  });
  it("titles and descriptions are unique", () => {
    expect(new Set(PUBLIC_PAGES.map((p) => p.title)).size).toBe(PUBLIC_PAGES.length);
    expect(new Set(PUBLIC_PAGES.map((p) => p.description)).size).toBe(PUBLIC_PAGES.length);
  });
  it("GA4 ids are validated", () => {
    expect(isValidGa4Id("G-ABC123XYZ")).toBe(true);
    expect(isValidGa4Id("<script>")).toBe(false);
  });
});
