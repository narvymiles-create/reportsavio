import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Users, GraduationCap, FileText, CalendarDays } from "lucide-react";

type Stat = { label: string; value: number | string; icon: any; hint?: string };

export default function Dashboard() {
  const [stats, setStats] = useState<Stat[]>([
    { label: "Learners", value: "—", icon: Users },
    { label: "Classes", value: "—", icon: GraduationCap },
    { label: "Terms", value: "—", icon: CalendarDays },
    { label: "Report cards", value: "—", icon: FileText },
  ]);

  useEffect(() => {
    (async () => {
      const [learners, classes, terms, reports] = await Promise.all([
        supabase.from("learners" as any).select("*", { count: "exact", head: true }),
        supabase.from("classes" as any).select("*", { count: "exact", head: true }),
        supabase.from("terms" as any).select("*", { count: "exact", head: true }),
        supabase.from("report_cards" as any).select("*", { count: "exact", head: true }),
      ]);
      setStats([
        { label: "Learners", value: learners.count ?? 0, icon: Users },
        { label: "Classes", value: classes.count ?? 0, icon: GraduationCap },
        { label: "Terms", value: terms.count ?? 0, icon: CalendarDays },
        { label: "Report cards", value: reports.count ?? 0, icon: FileText },
      ]);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your school's report card system.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>1. Configure your <strong>School Info</strong> (logo, contacts, motto).</p>
          <p>2. Add <strong>Classes &amp; Streams</strong>, then <strong>Subjects</strong>.</p>
          <p>3. Add <strong>Teachers</strong> and assign them to classes / subjects.</p>
          <p>4. Add <strong>Learners</strong> and create the current academic <strong>Term</strong>.</p>
          <p>5. Configure <strong>Grading System</strong> and <strong>Comments</strong>.</p>
          <p>6. Enter <strong>Marks</strong>, then generate <strong>Report Cards</strong>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
