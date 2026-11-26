import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";
import { PoweredByFooter } from "@/components/PoweredByFooter";
import { BillingBanner } from "@/components/billing/BillingBanner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolEntitlement } from "@/hooks/useSchoolEntitlement";
import { onlinePackageName, desktopPackageName } from "@/components/billing/PricingCards";
import { Badge } from "@/components/ui/badge";

export function AppLayout({ children }: { children: ReactNode }) {
  const { schoolId, signOut } = useAuth();
  const { entitlement, active } = useSchoolEntitlement();
  const { data: schoolName } = useQuery({
    queryKey: ["navigation-school-name", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return null;
      const { data: info, error } = await supabase.from("school_info")
        .select("name").eq("school_id", schoolId).eq("is_active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (info?.name) return info.name;
      const { data: school, error: schoolError } = await supabase.from("schools")
        .select("name").eq("id", schoolId).maybeSingle();
      if (schoolError) throw schoolError;
      return school?.name ?? null;
    },
  });
  const subscription = entitlement?.subscription;
  const licence = entitlement?.licence;
  const packageName = subscription
    ? `${onlinePackageName(subscription.tier)} · ${subscription.plan === "annual" ? "Annual" : `Term ${subscription.term_number}`} ${subscription.academic_year}`
    : licence ? `${desktopPackageName(licence.tier)} · Lifetime`
    : entitlement && entitlement.learner_balance > 0 ? `Pay per report · ${entitlement.learner_balance} Learners`
    : "No active package";
  const packageStatus = subscription ? (subscription.state === "grace" ? "Renewal grace" : "Active")
    : licence || (entitlement && entitlement.learner_balance > 0) ? "Active" : "Unpaid";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-14 border-b bg-card flex items-center justify-between gap-2 px-3 py-2 sticky top-0 z-10">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground hidden xl:inline shrink-0">
                School Report Card Management
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0">
              <div className="min-w-0 text-right" aria-label="School and package">
                <p className="text-sm font-semibold truncate" title={schoolName ?? undefined}>{schoolName ?? "My School"}</p>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs text-muted-foreground truncate" title={packageName}>
                    {entitlement ? packageName : active === null ? "Checking package…" : "Package unavailable"}
                  </span>
                  {entitlement && <Badge variant={packageStatus === "Active" ? "secondary" : "outline"} className="shrink-0 text-[10px] px-1.5 py-0">{packageStatus}</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut} className="shrink-0" aria-label="Sign out" title="Sign out">
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-x-hidden"><BillingBanner />{children}</main>
          <PoweredByFooter className="border-t bg-card" />
        </div>
      </div>
    </SidebarProvider>
  );
}
