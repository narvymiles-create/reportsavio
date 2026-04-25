import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  School,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Award,
  MessageSquareText,
  PenLine,
  FileText,
  UserCog,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "Configuration",
    items: [
      { title: "School Info", url: "/school", icon: School },
      { title: "Classes & Streams", url: "/classes", icon: GraduationCap },
      { title: "Subjects", url: "/subjects", icon: BookOpen },
      { title: "Teachers", url: "/teachers", icon: UserCog },
      { title: "Terms", url: "/terms", icon: CalendarDays },
    ],
  },
  {
    label: "Academics",
    items: [
      { title: "Learners", url: "/learners", icon: Users },
      { title: "Marks Entry", url: "/marks", icon: ClipboardList },
      { title: "Grading System", url: "/grading", icon: Award },
      { title: "Comments", url: "/comments", icon: MessageSquareText },
      { title: "Signatures", url: "/signatures", icon: PenLine },
    ],
  },
  {
    label: "Reports",
    items: [{ title: "Report Cards", url: "/report-cards", icon: FileText }],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold">
            S
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sidebar-foreground font-semibold text-sm">Sona Reports</div>
              <div className="text-sidebar-foreground/60 text-xs">Admin Console</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.url || (item.url !== "/" && pathname.startsWith(item.url));
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink to={item.url} end={item.url === "/"}>
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
