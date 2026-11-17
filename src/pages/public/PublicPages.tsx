import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Cards, Hero, PublicLayout, Section } from "./PublicLayout";

export const FAQS = [
  { q: "What is Skavio EduReports?", a: "Skavio EduReports is online school report card software. Schools enter marks, and the system grades learners and produces printable Nursery and Primary report cards as PDF files." },
  { q: "Who is it designed for?", a: "Head teachers, school administrators, directors of studies and class teachers in Nursery and Primary schools, starting with schools in Uganda." },
  { q: "How do schools generate report cards?", a: "Set up classes, subjects, terms and grading, enter learners' marks, then open Report Cards to preview, download or print one learner's card or a whole class at once." },
  { q: "Can we use our own report card design?", a: "Yes. Schools can upload their own report card template and set their own colours, borders, stamp and watermark, while the system fills in the learners' results." },
  { q: "Can we download and print report cards?", a: "Yes. Every report card can be downloaded as an A4 PDF or printed, individually or in bulk for a whole class." },
  { q: "Does it work offline?", a: "Skavio EduReports currently works online in a web browser on computers, tablets and phones. An internet connection is needed." },
  { q: "Is learner information private?", a: "Yes. Each school's learners, marks and report cards are only visible to that school's signed-in staff and are never shown on public pages." },
];

export function HomePage() {
  return (
    <PublicLayout>
      <Seo path="/" jsonLd={[{
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      }]} />
      <Hero h1="School report card generator for Nursery and Primary schools"
        lead="Skavio EduReports helps schools in Uganda enter marks, grade learners automatically and produce professional report cards ready to download as PDF or print — for one learner or a whole class." />
      <Section title="Everything your school needs for reporting">
        <Cards items={[
          { t: "Marks entry", d: "Enter BOT, MID, EOT and other assessments per class and subject." },
          { t: "Automatic grading", d: "Grades, points, aggregates, divisions and positions calculated from your school's own grading scale." },
          { t: "Nursery report cards", d: "Learning areas, grade colours and teacher comments on a colourful card." },
          { t: "Primary report cards", d: "Assessment tables, aggregates, divisions and comments on one A4 page." },
          { t: "Your design", d: "Use the built-in cards or upload your own template, colours, stamp and watermark." },
          { t: "Single and bulk PDF", d: "Download or print one report card or a whole class in one go." },
        ]} />
        <p className="mt-6 text-sm"><Link to="/features" className="text-primary underline">Explore all school reporting features</Link></p>
      </Section>
      <Section title="How it works">
        <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
          <li>Create your school account and add classes, subjects, teachers and terms.</li>
          <li>Set your grading scale, divisions and comment templates.</li>
          <li>Register learners and enter their marks.</li>
          <li>Preview, download or print report cards and class marksheets.</li>
        </ol>
      </Section>
      <Section title="Frequently asked questions">
        <div className="space-y-4">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold">{f.q}</h3>
              <p className="text-muted-foreground text-sm">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>
    </PublicLayout>
  );
}

export function FeaturesPage() {
  return (
    <PublicLayout>
      <Seo path="/features" />
      <Hero h1="School reporting features" lead="From marks entry to printed report cards, Skavio EduReports covers the full school assessment and reporting process." />
      <Section title="Assessment and grading">
        <Cards items={[
          { t: "Flexible assessments", d: "Beginning, mid and end of term exams plus extra assessments your school defines." },
          { t: "Grading scales", d: "Set grades, points and remarks; divisions are calculated automatically." },
          { t: "Class marksheets", d: "Positions, subject performance and division summaries, downloadable as PDF or CSV." },
        ]} />
      </Section>
      <Section title="Report card design and output">
        <Cards items={[
          { t: "Custom templates", d: "Upload your school's own report card design as a PDF or image." },
          { t: "Colours and branding", d: "School logo, colours, borders, stamp, watermark and signatures." },
          { t: "PDF download and printing", d: "A4 report cards for single learners or whole classes." },
        ]} />
        <p className="mt-6 text-sm">See <Link to="/nursery-report-cards" className="text-primary underline">Nursery report cards</Link> and <Link to="/primary-report-cards" className="text-primary underline">Primary report cards</Link>.</p>
      </Section>
    </PublicLayout>
  );
}

export function NurseryPage() {
  return (
    <PublicLayout>
      <Seo path="/nursery-report-cards" />
      <Hero h1="Nursery report card software" lead="Produce clear, colourful Nursery report cards that parents understand, built around learning areas rather than marks." />
      <Section title="Built for early years">
        <Cards items={[
          { t: "Learning areas", d: "Define your own learning areas with optional pictures." },
          { t: "Grade colours", d: "Choose the colour and label for each grade." },
          { t: "Comments", d: "Per-area comments plus class teacher and head teacher comments." },
          { t: "Photos and signatures", d: "Learner photo, school logo, stamp and teacher signatures." },
          { t: "Bulk printing", d: "Print or download a whole Nursery class at once." },
        ]} />
      </Section>
    </PublicLayout>
  );
}

export function PrimaryPage() {
  return (
    <PublicLayout>
      <Seo path="/primary-report-cards" />
      <Hero h1="Primary school report card generator" lead="Turn Primary marks into finished report cards with aggregates, divisions and positions calculated for you." />
      <Section title="Made for Primary reporting">
        <Cards items={[
          { t: "BOT, MID and EOT", d: "Separate or merged tables for each assessment, plus extra assessments." },
          { t: "Aggregates and divisions", d: "Calculated from your school's grading scale and division rules." },
          { t: "Positions", d: "Class positions and class marksheets ranked automatically." },
          { t: "Teacher comments", d: "Automatic comments based on performance, editable per learner." },
          { t: "One A4 page", d: "Every card is laid out to fit on one A4 page for printing." },
        ]} />
      </Section>
    </PublicLayout>
  );
}

export function AboutPage() {
  return (
    <PublicLayout>
      <Seo path="/about" />
      <Hero h1="About Skavio EduReports" lead="Skavio EduReports is developed by Skavio Technologies to make school reporting faster, more accurate and easier to manage." />
      <Section title="Our purpose">
        <p className="text-muted-foreground max-w-3xl">Preparing report cards by hand takes teachers days at the end of every term. Skavio EduReports brings marks, grading and report card design together in one place, so schools can focus on learners instead of paperwork. We are starting with Nursery and Primary schools in Uganda.</p>
        <p className="mt-4 text-sm"><Link to="/features" className="text-primary underline">See what Skavio EduReports can do</Link></p>
      </Section>
    </PublicLayout>
  );
}
