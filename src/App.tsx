import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAdmin } from "@/components/RequireAdmin";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import SchoolInfoPage from "./pages/SchoolInfoPage";
import TeachersPage from "./pages/TeachersPage";
import ClassesPage from "./pages/ClassesPage";
import SubjectsPage from "./pages/SubjectsPage";
import TermsPage from "./pages/TermsPage";
import LearnersPage from "./pages/LearnersPage";
import GradingPage from "./pages/GradingPage";
import CommentsPage from "./pages/CommentsPage";
import MarksPage from "./pages/MarksPage";
import MarksBOTPage from "./pages/MarksBOTPage";
import MarksMIDPage from "./pages/MarksMIDPage";
import MarksEOTPage from "./pages/MarksEOTPage";
import SignaturesPage from "./pages/SignaturesPage";
import ReportCardsPage from "./pages/ReportCardsPage";
import PrintReportCard from "./pages/PrintReportCard";
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
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/school" element={<Protected><SchoolInfoPage /></Protected>} />
            <Route path="/classes" element={<Protected><ClassesPage /></Protected>} />
            <Route path="/subjects" element={<Protected><SubjectsPage /></Protected>} />
            <Route path="/teachers" element={<Protected><TeachersPage /></Protected>} />
            <Route path="/terms" element={<Protected><TermsPage /></Protected>} />
            <Route path="/learners" element={<Protected><LearnersPage /></Protected>} />
            <Route path="/marks" element={<Protected><MarksPage /></Protected>} />
            <Route path="/marks/bot" element={<Protected><MarksBOTPage /></Protected>} />
            <Route path="/marks/mid" element={<Protected><MarksMIDPage /></Protected>} />
            <Route path="/marks/eot" element={<Protected><MarksEOTPage /></Protected>} />
            <Route path="/grading" element={<Protected><GradingPage /></Protected>} />
            <Route path="/comments" element={<Protected><CommentsPage /></Protected>} />
            <Route path="/signatures" element={<Protected><SignaturesPage /></Protected>} />
            <Route path="/report-cards" element={<Protected><ReportCardsPage /></Protected>} />
            <Route path="/print/report-card/:learnerId/:termId" element={<RequireAdmin><PrintReportCard /></RequireAdmin>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
