import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import logo from "@/assets/skavio-logo.png.asset.json";

const nav = [
  { to: "/features", label: "Features" },
  { to: "/nursery-report-cards", label: "Nursery" },
  { to: "/primary-report-cards", label: "Primary" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src={logo.url} alt="Skavio EduReports logo" width={72} height={24} className="h-6 w-auto" />
            <span>Skavio EduReports</span>
          </Link>
          <nav aria-label="Main" className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => isActive ? "text-foreground font-medium" : "hover:text-foreground"}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in</Link></Button>
            <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground flex flex-wrap gap-4 justify-between">
          <p>© {new Date().getFullYear()} Skavio Technologies. Skavio EduReports — school report card software.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link to="/" className="hover:text-foreground">Home</Link>
            {nav.map((n) => <Link key={n.to} to={n.to} className="hover:text-foreground">{n.label}</Link>)}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

export function Cards({ items }: { items: { t: string; d: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.t} className="rounded-lg border bg-card p-5">
          <h3 className="font-semibold mb-1">{i.t}</h3>
          <p className="text-sm text-muted-foreground">{i.d}</p>
        </div>
      ))}
    </div>
  );
}

export function Hero({ h1, lead }: { h1: string; lead: string }) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="text-3xl md:text-4xl font-bold max-w-3xl">{h1}</h1>
        <p className="mt-4 max-w-2xl opacity-90">{lead}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="secondary"><Link to="/auth">Create your school account</Link></Button>
          <Button asChild variant="outline" className="bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"><Link to="/features">See features</Link></Button>
        </div>
      </div>
    </section>
  );
}
