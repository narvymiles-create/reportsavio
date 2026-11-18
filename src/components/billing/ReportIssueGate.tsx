import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportOutput, type OutputRequest } from "@/hooks/useReportOutput";

/**
 * Print views: shows the printable report cards only after printing is unlocked (paid, covered,
 * or Learners confirmed). Locked schools are sent to the pricing page with their selection kept.
 */
export function ReportOutputGate({ request, children }: { request: OutputRequest; children: ReactNode }) {
  const { ensure } = useReportOutput();
  const key = `${request.level}|${request.termId}|${request.action}|${request.learnerIds.join(",")}`;
  const [state, setState] = useState<"checking" | "ready" | "locked">("checking");
  const lastKey = useRef("");

  useEffect(() => {
    if (!request.learnerIds.length || lastKey.current === key) return;
    lastKey.current = key;
    setState("checking");
    ensure(request).then((q) => setState(q ? "ready" : "locked"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state === "ready") return <>{children}</>;
  if (state === "checking") return <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <div className="no-print mx-auto my-10 max-w-md space-y-3 rounded-md border p-5 text-center text-sm">
      <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="font-medium">Printing is locked</p>
      <p className="text-muted-foreground">You can still preview report cards for free. Choose a package to unlock printing and downloads.</p>
      <Button asChild size="sm"><Link to="/pricing">See packages</Link></Button>
    </div>
  );
}
