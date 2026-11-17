import { useState } from "react";
import { Loader2 } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "@/hooks/use-toast";

/** Official-style Google button (Google branding guidelines, light theme). */
export function GoogleButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        const msg = String((result.error as { message?: string }).message ?? result.error);
        const cancelled = /cancel|closed|denied|access_denied/i.test(msg);
        toast({
          title: cancelled ? "Google sign-in cancelled" : "Google sign-in failed",
          description: cancelled ? "No changes were made. You can try again any time." : msg,
          variant: cancelled ? undefined : "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      style={{ background: "#FFFFFF", borderColor: "#747775", color: "#1F1F1F" }}
      className="flex h-10 w-full items-center justify-center gap-[10px] rounded-md border px-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : (
        <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
      )}
      <span>{label}</span>
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
    </div>
  );
}
