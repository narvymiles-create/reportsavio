import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown instead of the app when the device's date/time is wrong, which would otherwise sign the user out repeatedly. */
export function ClockWarning() {
  const shown = new Date().toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div role="alert" className="max-w-lg w-full rounded-xl border bg-card p-8 shadow-sm space-y-4 text-card-foreground">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-destructive/10 p-2 text-destructive"><Clock className="h-6 w-6" aria-hidden /></span>
          <h1 className="text-xl font-semibold">Your computer's date or time is wrong</h1>
        </div>
        <p className="text-muted-foreground">
          This device shows <strong className="text-foreground">{shown}</strong>. Skavio EduReports can't keep you signed in until the clock is correct.
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
          <li>Open your computer's <strong className="text-foreground">Date &amp; time</strong> settings.</li>
          <li>Turn on <strong className="text-foreground">Set time automatically</strong> and <strong className="text-foreground">Set time zone automatically</strong> (or enter today's correct date and time).</li>
          <li>Come back here and press the button below.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Your school's data is safe; nothing was changed.</p>
        <Button className="w-full" onClick={() => window.location.reload()}>I've fixed the clock, reload</Button>
      </div>
    </main>
  );
}
