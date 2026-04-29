import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, School } from "lucide-react";

export default function OnboardingSchool() {
  const { refreshContext, signOut } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    const { error } = await supabase.rpc("create_school_for_current_user" as any, {
      _name: String(fd.get("name") ?? "").trim(),
      _email: String(fd.get("email") ?? "").trim() || null,
      _phone: String(fd.get("phone") ?? "").trim() || null,
      _address: String(fd.get("address") ?? "").trim() || null,
    });
    if (error) {
      setSubmitting(false);
      toast({ title: "Could not create school", description: error.message, variant: "destructive" });
      return;
    }
    await refreshContext();
    setSubmitting(false);
    toast({ title: "School created" });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center text-primary-foreground mb-2" style={{ background: "var(--gradient-primary)" }}>
            <School className="h-7 w-7" />
          </div>
          <CardTitle>Set up your school</CardTitle>
          <CardDescription>Tell us about your school. You'll be its admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">School name *</Label>
              <Input id="name" name="name" required maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" maxLength={200} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create school
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={async () => { await signOut(); navigate("/auth", { replace: true }); }}>
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
