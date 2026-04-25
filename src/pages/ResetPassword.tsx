import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, GraduationCap } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts a recovery session in the URL hash; the client picks it up
    // automatically. We just confirm a session exists once it's processed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else {
        // Allow a tick for the hash to be parsed
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (s2) setReady(true);
            else setError("This reset link is invalid or has expired. Please request a new one.");
          });
        }, 800);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password"));
    const confirm = String(fd.get("confirm"));
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateErr) {
      toast({ title: "Could not update password", description: updateErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "You're now signed in." });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Set a new password</h1>
        </div>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>Enter and confirm your new password below.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="space-y-4 text-sm">
                <p className="text-destructive">{error}</p>
                <Button onClick={() => navigate("/forgot-password")} className="w-full">
                  Request a new link
                </Button>
              </div>
            ) : !ready ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Verifying link…
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-password">New password</Label>
                  <Input id="rp-password" name="password" type="password" required minLength={6} autoComplete="new-password" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-confirm">Confirm password</Label>
                  <Input id="rp-confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Update password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
