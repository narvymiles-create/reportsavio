import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ensureSchoolForUser } from "@/lib/autoSchool";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isSuperAdmin, schoolId, loading, signOut, refreshContext } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [setupError, setSetupError] = useState<string | null>(null);
  const needsSchool = !loading && !!user && !isSuperAdmin && !schoolId;

  // New accounts get their school created automatically (no setup form).
  useEffect(() => {
    if (!needsSchool || !user || setupError) return;
    let cancelled = false;
    ensureSchoolForUser(user.id).then(async (err) => {
      if (cancelled) return;
      if (err) setSetupError(err);
      else await refreshContext();
    });
    return () => { cancelled = true; };
  }, [needsSchool, user, setupError, refreshContext]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Super admins bypass school requirement
  if (!isSuperAdmin && !schoolId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        {setupError ? (
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-semibold">We couldn't prepare your school</h1>
            <p className="text-muted-foreground">{setupError}</p>
            <Button onClick={() => setSetupError(null)}>Try again</Button>
          </div>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        )}
      </div>
    );
  }

  if (!isAdmin && !isSuperAdmin) {
    const handleGoToLogin = async () => {
      await signOut();
      navigate("/auth", { replace: true });
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">No admin access</h1>
          <p className="text-muted-foreground">
            Your account is signed in but does not have admin permissions. Ask the school administrator to grant you access.
          </p>
          <Button onClick={handleGoToLogin} variant="default">
            Go to login
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
