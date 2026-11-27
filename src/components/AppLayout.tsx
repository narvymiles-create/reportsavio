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
import { evaluateCapacity, graceLimit } from "@/lib/billing/api";

export function AppLayout({ children }: { children: ReactNode }) {
  const { schoolId, signOut } = useAuth();
  const { entitlement, active } = useSchoolEntitlement();
  const { data: totalLearners } = useQuery({
    queryKey: ["navigation-active-learners", schoolId],
    enabled: !!schoolId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!schoolId) return null;
      const [primary, nursery] = await Promise.all([
        supabase.from("learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
        supabase.from("nursery_learners").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
      ]);
      if (primary.error) throw primary.error;
      if (nursery.error) throw nursery.error;
      return (primary.count ?? 0) + (nursery.count ?? 0);
    },
  });
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
  const capacityPackage = subscription ?? licence;
  const allowance = capacityPackage ? capacityPackage.grace_limit ?? graceLimit(capacityPackage.capacity) : null;
  const remaining = capacityPackage && allowance !== null && totalLearners != null
    ? evaluateCapacity({ activeLearners: totalLearners, licensed: capacityPackage.capacity, graceLimit: allowance, overSince: null }).remaining
    : entitlement?.learner_balance ?? null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-12 border-b bg-card flex items-center justify-between gap-2 px-2.5 py-1.5 sticky top-0 z-10 sm:min-h-14 sm:px-3 sm:py-2">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground hidden 2xl:inline shrink-0">
                School Report Card Management
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0">
              <div className="min-w-0 text-right" aria-label="School and package">
                <p className="max-w-[calc(100vw-7.5rem)] text-sm font-semibold truncate sm:max-w-none" title={schoolName ?? undefined}>{schoolName ?? "My School"}</p>
                <div className="hidden sm:flex items-center justify-end gap-1.5">
                  <span className="text-xs text-muted-foreground truncate" title={packageName}>
                    {entitlement ? packageName : active === null ? "Checking package…" : "Package unavailable"}
                  </span>
                  {entitlement && <Badge variant={packageStatus === "Active" ? "secondary" : "outline"} className="shrink-0 text-[10px] px-1.5 py-0">{packageStatus}</Badge>}
                </div>
                <p className="hidden sm:block text-xs text-muted-foreground" aria-label="Package learner counts" title={allowance !== null ? `Includes permanent Growth Allowance up to ${allowance} active learners` : undefined}>
                  Total learners: {totalLearners ?? "—"} · Learners left: {remaining ?? "—"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut} className="shrink-0 px-2 sm:px-3" aria-label="Sign out" title="Sign out">
                <LogOut className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden"><BillingBanner />{children}</main>
          <PoweredByFooter className="border-t bg-card" />
        </div>
      </div>
    </SidebarProvider>
  );
}
