import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import logo from "@/assets/skavio-logo.png.asset.json";

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState<string | null>(null);

  useEffect(() => {
    // Show verification link problems (expired / already used) instead of failing silently.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    const err = hash.get("error_description") || search.get("error_description");
    if (err) setNotice(`Verification link problem: ${err.replace(/\+/g, " ")}. Sign in, or resend the confirmation email.`);
    else if (search.get("verified")) setNotice("Your email is confirmed. You can sign in now.");
  }, []);

  const resend = async () => {
    if (!resendEmail) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: resendEmail, options: { emailRedirectTo: `${window.location.origin}/auth?verified=1` } });
    toast(error ? { title: "Could not resend", description: error.message, variant: "destructive" } : { title: "Confirmation email sent", description: `Check ${resendEmail}.` });
  };

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const email = String(fd.get("email")).trim().toLowerCase();
    const { error } = await signIn(email, String(fd.get("password")));
    setSubmitting(false);
    setResendEmail(error && /confirm/i.test(error) ? email : null);
    if (error) toast({ title: "Sign in failed", description: error, variant: "destructive" });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await signUp(
      String(fd.get("email")),
      String(fd.get("password")),
      String(fd.get("full_name"))
    );
    setSubmitting(false);
    if (error) {
      toast({ title: "Sign up failed", description: error, variant: "destructive" });
    } else {
      toast({
        title: "Account created",
        description: "Check your email to confirm, then sign in.",
      });
      setResendEmail(String(fd.get("email")).trim().toLowerCase());
      setNotice("We sent you a confirmation email from Skavio EduReports. Click the link, then sign in.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-6">
          <img src={logo.url} alt="Skavio EduReports logo" className="h-16 w-16 object-contain" />
          <h1 className="text-2xl font-bold">Skavio EduReports</h1>
          <p className="text-sm text-muted-foreground">School report card management</p>
        </div>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create the first admin account.</CardDescription>
          </CardHeader>
          <CardContent>
            {notice && <p className="mb-3 rounded-md border bg-muted p-3 text-sm">{notice}</p>}
            {resendEmail && (
              <Button type="button" variant="outline" className="mb-3 w-full" onClick={resend}>Resend confirmation email</Button>
            )}
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                  <GoogleButton label="Continue with Google" />
                  <OrDivider />
                  <div className="space-y-1.5">
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="si-password">Password</Label>
                    <PasswordInput id="si-password" name="password" required autoComplete="current-password" minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Sign in
                  </Button>
                  <div className="text-center text-sm">
                    <Link
                      to="/forgot-password"
                      className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    >
                      Forgot your password?
                    </Link>
                  </div>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                  <GoogleButton label="Sign up with Google" />
                  <OrDivider />
                  <div className="space-y-1.5">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input id="su-name" name="full_name" required maxLength={100} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-email">Email</Label>
                    <Input id="su-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-password">Password</Label>
                    <PasswordInput id="su-password" name="password" required autoComplete="new-password" minLength={6} />
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
