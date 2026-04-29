import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAdmin } from "@/components/RequireAdmin";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import OnboardingSchool from "./pages/OnboardingSchool";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NurseryDashboard from "./pages/NurseryDashboard";
import { useReportModule } from "@/hooks/useReportModule";
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
import SettingsPage from "./pages/SettingsPage";
import PrintReportCard from "./pages/PrintReportCard";
import BulkReportCardsPage from "./pages/BulkReportCardsPage";
import NurseryClassesPage from "./pages/nursery/NurseryClassesPage";
import NurseryLearningAreasPage from "./pages/nursery/NurseryLearningAreasPage";
import NurseryColorsPage from "./pages/nursery/NurseryColorsPage";
import NurseryLearnersPage from "./pages/nursery/NurseryLearnersPage";
import NurseryAssessmentPage from "./pages/nursery/NurseryAssessmentPage";
import NurseryReportsPage from "./pages/nursery/NurseryReportsPage";
import PrintNurseryReportCard from "./pages/PrintNurseryReportCard";
import BulkNurseryReportCardsPage from "./pages/BulkNurseryReportCardsPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const Protected = ({ children }: { children: React.ReactNode }) => (
  <RequireAdmin>
    <AppLayout>{children}</AppLayout>
  </RequireAdmin>
);

const HomeDashboard = () => {
  const { module } = useReportModule();
  return module === "nursery" ? <NurseryDashboard /> : <Dashboard />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<OnboardingSchool />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Protected><HomeDashboard /></Protected>} />
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
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
            <Route path="/print/report-card/:learnerId/:termId" element={<RequireAdmin><PrintReportCard /></RequireAdmin>} />
            <Route path="/print/bulk/:termId/:classId" element={<RequireAdmin><BulkReportCardsPage /></RequireAdmin>} />
            {/* Nursery module */}
            <Route path="/nursery/classes" element={<Protected><NurseryClassesPage /></Protected>} />
            <Route path="/nursery/learning-areas" element={<Protected><NurseryLearningAreasPage /></Protected>} />
            <Route path="/nursery/colors" element={<Protected><NurseryColorsPage /></Protected>} />
            <Route path="/nursery/learners" element={<Protected><NurseryLearnersPage /></Protected>} />
            <Route path="/nursery/assessment" element={<Protected><NurseryAssessmentPage /></Protected>} />
            <Route path="/nursery/reports" element={<Protected><NurseryReportsPage /></Protected>} />
            <Route path="/print/nursery/:learnerId/:termId" element={<RequireAdmin><PrintNurseryReportCard /></RequireAdmin>} />
            <Route path="/print/nursery-bulk/:termId/:classId" element={<RequireAdmin><BulkNurseryReportCardsPage /></RequireAdmin>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
