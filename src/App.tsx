import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAdmin } from "@/components/RequireAdmin";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import SchoolInfoPage from "./pages/SchoolInfoPage";
import { ComingSoon } from "@/components/ComingSoon";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const Protected = ({ children }: { children: React.ReactNode }) => (
  <RequireAdmin>
    <AppLayout>{children}</AppLayout>
  </RequireAdmin>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/school" element={<Protected><SchoolInfoPage /></Protected>} />
            <Route path="/classes" element={<Protected><ComingSoon title="Classes & Streams" description="Create classes (P1–P7) and streams, assign class teachers." /></Protected>} />
            <Route path="/subjects" element={<Protected><ComingSoon title="Subjects" description="Add subjects per class with max marks and subject teachers." /></Protected>} />
            <Route path="/teachers" element={<Protected><ComingSoon title="Teachers" description="Manage teachers and view all their assignments." /></Protected>} />
            <Route path="/terms" element={<Protected><ComingSoon title="Academic Terms" description="Create terms with year, start/end, next-begins dates." /></Protected>} />
            <Route path="/learners" element={<Protected><ComingSoon title="Learners" description="Add learners, upload photos. CSV import in v2." /></Protected>} />
            <Route path="/marks" element={<Protected><ComingSoon title="Marks Entry" description="Enter marks per learner per subject for all 3 stages." /></Protected>} />
            <Route path="/grading" element={<Protected><ComingSoon title="Grading System" description="Configure grade bands, points, and division rules." /></Protected>} />
            <Route path="/comments" element={<Protected><ComingSoon title="Comment Templates" description="Auto-comments based on average. Multiple per range, picked randomly." /></Protected>} />
            <Route path="/signatures" element={<Protected><ComingSoon title="Signatures" description="Upload per-class teacher signatures and the head teacher signature." /></Protected>} />
            <Route path="/report-cards" element={<Protected><ComingSoon title="Report Cards" description="Generate, view, download, and re-generate report card PDFs." /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
