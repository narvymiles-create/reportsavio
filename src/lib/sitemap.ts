import { PUBLIC_PAGES, SITE_URL } from "./seo";
export const buildSitemap = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  PUBLIC_PAGES.map((p) => `  <url><loc>${SITE_URL}${p.path}</loc></url>`).join("\n") +
  `\n</urlset>\n`;
