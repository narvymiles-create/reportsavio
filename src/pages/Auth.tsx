import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, GraduationCap } from "lucide-react";

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await signIn(String(fd.get("email")), String(fd.get("password")));
    setSubmitting(false);
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
        description: "You can now sign in. The first account is granted admin automatically.",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Sona Report Cards</h1>
          <p className="text-sm text-muted-foreground">School report card management</p>
        </div>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create the first admin account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="si-password">Password</Label>
                    <Input id="si-password" name="password" type="password" required autoComplete="current-password" minLength={6} />
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
                    <Input id="su-password" name="password" type="password" required autoComplete="new-password" minLength={6} />
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
