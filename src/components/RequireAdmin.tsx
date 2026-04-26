import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  if (!isAdmin) {
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
