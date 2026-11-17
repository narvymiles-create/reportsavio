// Regenerates public/sitemap.xml from PUBLIC_PAGES: bun scripts/generate-sitemap.ts
import { writeFileSync } from "node:fs";
import { buildSitemap } from "../src/lib/sitemap";
writeFileSync("public/sitemap.xml", buildSitemap());
