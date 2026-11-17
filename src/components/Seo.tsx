import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { OG_IMAGE, PUBLIC_PATHS, SITE_URL, pageFor } from "@/lib/seo";

/** Per-page metadata for a public page. */
export function Seo({ path, jsonLd }: { path: string; jsonLd?: object[] }) {
  const p = pageFor(path);
  const url = `${SITE_URL}${path}`;
  const crumbs = path === "/" ? [] : [{
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: p.name, item: url },
    ],
  }];
  return (
    <Helmet>
      <title>{p.title}</title>
      <meta name="description" content={p.description} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={p.title} />
      <meta property="og:description" content={p.description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:title" content={p.title} />
      <meta name="twitter:description" content={p.description} />
      <meta name="twitter:image" content={OG_IMAGE} />
      {[...crumbs, ...(jsonLd ?? [])].map((d, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(d)}</script>
      ))}
    </Helmet>
  );
}

/** Every non-public route (sign-in, dashboards, learners, print pages) is noindex. */
export function PrivateRobots() {
  const { pathname } = useLocation();
  if (PUBLIC_PATHS.has(pathname)) return null;
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow" />
      <title>Skavio EduReports</title>
    </Helmet>
  );
}
