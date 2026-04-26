import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Baby,
  GraduationCap,
  FileText,
  CalendarDays,
  School,
  Shapes,
  Palette,
  ClipboardList,
  MessageSquareText,
  PenLine,
  UserCog,
  Settings as SettingsIcon,
} from "lucide-react";

type Stat = { label: string; value: number | string; icon: any; to: string };

const navItems = [
  { label: "School Info", to: "/school", icon: School, desc: "Logo, contacts, motto" },
  { label: "Nursery Classes", to: "/nursery/classes", icon: GraduationCap, desc: "Classes & streams" },
  { label: "Learning Areas", to: "/nursery/learning-areas", icon: Shapes, desc: "Areas & icons" },
  { label: "Color Key", to: "/nursery/colors", icon: Palette, desc: "Grade colors" },
  { label: "Nursery Class Teachers", to: "/teachers", icon: UserCog, desc: "Manage nursery staff" },
  { label: "Terms", to: "/terms", icon: CalendarDays, desc: "Academic terms" },
  { label: "Nursery Learners", to: "/nursery/learners", icon: Baby, desc: "Pupils & photos" },
  { label: "Assessment Entry", to: "/nursery/assessment", icon: ClipboardList, desc: "Color grades & comments" },
  { label: "Comments", to: "/comments", icon: MessageSquareText, desc: "Auto comments" },
  { label: "Signatures", to: "/signatures", icon: PenLine, desc: "Head & class teacher" },
  { label: "Nursery Report Cards", to: "/nursery/reports", icon: FileText, desc: "Generate & print" },
  { label: "Nursery Settings", to: "/settings", icon: SettingsIcon, desc: "System config" },
];

export default function NurseryDashboard() {
  const [stats, setStats] = useState<Stat[]>([
    { label: "Nursery Learners", value: "—", icon: Baby, to: "/nursery/learners" },
    { label: "Nursery Classes", value: "—", icon: GraduationCap, to: "/nursery/classes" },
    { label: "Terms", value: "—", icon: CalendarDays, to: "/terms" },
    { label: "Nursery Report Cards", value: "—", icon: FileText, to: "/nursery/reports" },
  ]);

  useEffect(() => {
    (async () => {
      const [learners, classes, terms, reports] = await Promise.all([
        (supabase.from("nursery_learners" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("nursery_classes" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("terms" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("nursery_report_cards" as any) as any).select("*", { count: "exact", head: true }),
      ]);
      setStats([
        { label: "Nursery Learners", value: learners.count ?? 0, icon: Baby, to: "/nursery/learners" },
        { label: "Nursery Classes", value: classes.count ?? 0, icon: GraduationCap, to: "/nursery/classes" },
        { label: "Terms", value: terms.count ?? 0, icon: CalendarDays, to: "/terms" },
        { label: "Nursery Report Cards", value: reports.count ?? 0, icon: FileText, to: "/nursery/reports" },
      ]);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nursery Dashboard</h1>
        <p className="text-muted-foreground">Overview of your nursery school's report card system.</p>
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
            <Link key={n.label} to={n.to} className="block">
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
