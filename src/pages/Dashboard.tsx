import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  GraduationCap,
  FileText,
  CalendarDays,
  School,
  BookOpen,
  ClipboardList,
  Award,
  MessageSquareText,
  PenLine,
  UserCog,
  Settings as SettingsIcon,
} from "lucide-react";

type Stat = { label: string; value: number | string; icon: any; to: string };

const navItems = [
  { label: "School Info", to: "/school", icon: School, desc: "Logo, contacts, motto" },
  { label: "Classes", to: "/classes", icon: GraduationCap, desc: "Classes & streams" },
  { label: "Subjects", to: "/subjects", icon: BookOpen, desc: "Subjects per class" },
  { label: "Teachers", to: "/teachers", icon: UserCog, desc: "Manage staff" },
  { label: "Terms", to: "/terms", icon: CalendarDays, desc: "Academic terms" },
  { label: "Learners", to: "/learners", icon: Users, desc: "Pupils & photos" },
  { label: "Marks", to: "/marks", icon: ClipboardList, desc: "Enter exam marks" },
  { label: "Grading", to: "/grading", icon: Award, desc: "Grading scale" },
  { label: "Comments", to: "/comments", icon: MessageSquareText, desc: "Auto comments" },
  { label: "Signatures", to: "/signatures", icon: PenLine, desc: "Head & class teacher" },
  { label: "Report Cards", to: "/report-cards", icon: FileText, desc: "Generate & print" },
  { label: "Settings", to: "/settings", icon: SettingsIcon, desc: "Houses & field config" },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stat[]>([
    { label: "Learners", value: "—", icon: Users, to: "/learners" },
    { label: "Classes", value: "—", icon: GraduationCap, to: "/classes" },
    { label: "Terms", value: "—", icon: CalendarDays, to: "/terms" },
    { label: "Report cards", value: "—", icon: FileText, to: "/report-cards" },
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
        { label: "Learners", value: learners.count ?? 0, icon: Users, to: "/learners" },
        { label: "Classes", value: classes.count ?? 0, icon: GraduationCap, to: "/classes" },
        { label: "Terms", value: terms.count ?? 0, icon: CalendarDays, to: "/terms" },
        { label: "Report cards", value: reports.count ?? 0, icon: FileText, to: "/report-cards" },
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
          <Link key={s.label} to={s.to} className="block">
            <Card className="overflow-hidden cursor-pointer transition hover:border-primary hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{s.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-3">Modules</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {navItems.map((n) => (
            <Link key={n.to} to={n.to} className="block">
              <Card className="cursor-pointer transition hover:border-primary hover:shadow-md hover:bg-accent/40">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <n.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{n.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{n.desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
