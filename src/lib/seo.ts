/** Single source of truth for public (indexable) pages. Everything else is noindex. */
export const SITE_URL = "https://skavioedureports.dev";
export const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export interface PublicPage { path: string; title: string; description: string; name: string }

export const PUBLIC_PAGES: PublicPage[] = [
  { path: "/", name: "Home", title: "Skavio EduReports | School Report Card Generator & Management Software",
    description: "Generate, manage, download and print professional school report cards with Skavio EduReports. Flexible report-card software for Nursery and Primary schools in Uganda." },
  { path: "/features", name: "Features", title: "School Reporting Features | Skavio EduReports",
    description: "Marks entry, automatic grading and divisions, custom templates and colours, single and bulk PDF report cards, marksheets and printing for schools." },
  { path: "/nursery-report-cards", name: "Nursery Reports", title: "Nursery Report Card Software | Skavio EduReports",
    description: "Create colourful Nursery report cards with learning areas, grade colours, teacher comments, photos and signatures. Download as PDF or print in bulk." },
  { path: "/primary-report-cards", name: "Primary Reports", title: "Primary School Report Card Generator | Skavio EduReports",
    description: "Primary school report card generator with BOT, MID and EOT assessments, aggregates, divisions, positions and class marksheets for Ugandan schools." },
  { path: "/pricing", name: "Pricing", title: "Pricing in UGX | Skavio EduReports School Report Card Software",
    description: "Skavio EduReports prices in UGX: termly or annual online subscriptions, one-time desktop lifetime licences, or UGX 500 per report card, with a permanent 10% Growth Allowance." },
  { path: "/about", name: "About", title: "About Skavio EduReports | Skavio Technologies",
    description: "Skavio EduReports is school report card software developed by Skavio Technologies to simplify learner assessment and reporting for schools." },
];

export const PUBLIC_PATHS = new Set(PUBLIC_PAGES.map((p) => p.path));
export const pageFor = (path: string) => PUBLIC_PAGES.find((p) => p.path === path)!;

/** Keep analytics/verification IDs strictly shaped so nothing unsafe reaches <head>. */
export const isValidGa4Id = (v: string) => /^G-[A-Z0-9]{4,12}$/.test(v);
export const isValidGscToken = (v: string) => /^[A-Za-z0-9_-]{10,100}$/.test(v);
