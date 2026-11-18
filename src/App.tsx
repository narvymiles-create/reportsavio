import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import MarksAssessmentPage from "./pages/MarksAssessmentPage";
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
import ReportTemplatesPage from "./pages/ReportTemplatesPage";
import ReportAppearancePage from "./pages/ReportAppearancePage";
import BillingPage from "./pages/BillingPage";
import PlatformBillingPage from "./pages/PlatformBillingPage";
import PlatformPaymentsPage from "./pages/PlatformPaymentsPage";
import ActivatePage from "./pages/ActivatePage";
import PricingPage from "./pages/PricingPage";
import FeatureManagementPage from "./pages/FeatureManagementPage";
import { FeaturesProvider } from "@/contexts/FeaturesContext";
import { FeatureNotice, FeaturePage } from "@/components/FeatureNotice";
import { PublicLayout } from "./pages/public/PublicLayout";
import { Seo } from "@/components/Seo";
import { HelmetProvider } from "react-helmet-async";
import { useAuth } from "@/contexts/AuthContext";
import { PrivateRobots } from "@/components/Seo";
import { HomePage, FeaturesPage, NurseryPage, PrimaryPage, AboutPage } from "./pages/public/PublicPages";

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

/** Signed-out visitors see the public home page; signed-in staff see their dashboard. */
const HomeRoute = () => {
  const { user, loading } = useAuth();
  if (!loading && !user) return <HomePage />;
  return <Protected><HomeDashboard /></Protected>;
};

/** Pricing is public for visitors and interactive (with checkout) for signed-in school administrators. */
const PricingRoute = () => {
  const { user, loading } = useAuth();
  if (!loading && !user) return (
    <PublicLayout><Seo path="/pricing" /><div className="mx-auto max-w-6xl px-4 py-8"><PricingPage signedIn={false} /></div></PublicLayout>
  );
  return <Protected><PricingPage /></Protected>;
};

const App = () => (
  <HelmetProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <FeaturesProvider>
          <PrivateRobots />
          <Routes>
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/nursery-report-cards" element={<NurseryPage />} />
            <Route path="/primary-report-cards" element={<PrimaryPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<HomeRoute />} />
            <Route path="/school" element={<Protected><FeatureNotice keys={["custom_fields", "appearance"]} /><SchoolInfoPage /></Protected>} />
            <Route path="/classes" element={<Protected><ClassesPage /></Protected>} />
            <Route path="/subjects" element={<Protected><SubjectsPage /></Protected>} />
            <Route path="/teachers" element={<Protected><TeachersPage /></Protected>} />
            <Route path="/terms" element={<Protected><TermsPage /></Protected>} />
            <Route path="/learners" element={<Protected><FeatureNotice keys={["learner_editing", "custom_fields"]} /><LearnersPage /></Protected>} />
            <Route path="/marks" element={<Protected><FeatureNotice keys={["marks_entry"]} /><MarksPage /></Protected>} />
            <Route path="/marks/bot" element={<Protected><FeatureNotice keys={["marks_entry", "marksheet_output"]} /><MarksBOTPage /></Protected>} />
            <Route path="/marks/mid" element={<Protected><FeatureNotice keys={["marks_entry", "marksheet_output"]} /><MarksMIDPage /></Protected>} />
            <Route path="/marks/eot" element={<Protected><FeatureNotice keys={["marks_entry", "marksheet_output"]} /><MarksEOTPage /></Protected>} />
            <Route path="/marks/a/:assessment" element={<Protected><FeatureNotice keys={["marks_entry", "marksheet_output"]} /><MarksAssessmentPage /></Protected>} />
            <Route path="/grading" element={<Protected><GradingPage /></Protected>} />
            <Route path="/comments" element={<Protected><FeatureNotice keys={["report_comments"]} /><CommentsPage /></Protected>} />
            <Route path="/signatures" element={<Protected><SignaturesPage /></Protected>} />
            <Route path="/report-cards" element={<Protected><FeaturePage feature="primary_reports"><FeatureNotice keys={["download", "bulk_download", "print", "bulk_print"]} /><ReportCardsPage /></FeaturePage></Protected>} />
            <Route path="/settings" element={<Protected><FeatureNotice keys={["appearance", "marks_entry"]} /><SettingsPage /></Protected>} />
            <Route path="/report-appearance" element={<Protected><FeaturePage feature="appearance"><ReportAppearancePage /></FeaturePage></Protected>} />
            <Route path="/report-templates" element={<Protected><FeaturePage feature="template_view"><FeatureNotice keys={["template_select", "template_create", "template_edit", "custom_fields"]} /><ReportTemplatesPage /></FeaturePage></Protected>} />
            <Route path="/billing" element={<Protected><BillingPage /></Protected>} />
            <Route path="/platform/billing" element={<Protected><PlatformBillingPage /></Protected>} />
            <Route path="/platform/payments" element={<Protected><PlatformPaymentsPage /></Protected>} />
            <Route path="/activate" element={<Protected><ActivatePage /></Protected>} />
            <Route path="/platform/features" element={<Protected><FeatureManagementPage /></Protected>} />
            <Route path="/pricing" element={<PricingRoute />} />
            <Route path="/print/report-card/:learnerId/:termId" element={<RequireAdmin><PrintReportCard /></RequireAdmin>} />
            <Route path="/print/bulk/:termId/:classId" element={<RequireAdmin><BulkReportCardsPage /></RequireAdmin>} />
            {/* Nursery module */}
            <Route path="/nursery/classes" element={<Protected><NurseryClassesPage /></Protected>} />
            <Route path="/nursery/learning-areas" element={<Protected><NurseryLearningAreasPage /></Protected>} />
            <Route path="/nursery/colors" element={<Protected><NurseryColorsPage /></Protected>} />
            <Route path="/nursery/learners" element={<Protected><FeatureNotice keys={["learner_editing"]} /><NurseryLearnersPage /></Protected>} />
            <Route path="/nursery/assessment" element={<Protected><FeatureNotice keys={["marks_entry"]} /><NurseryAssessmentPage /></Protected>} />
            <Route path="/nursery/reports" element={<Protected><FeaturePage feature="nursery_reports"><FeatureNotice keys={["download", "bulk_download", "print", "bulk_print", "report_comments"]} /><NurseryReportsPage /></FeaturePage></Protected>} />
            <Route path="/print/nursery/:learnerId/:termId" element={<RequireAdmin><PrintNurseryReportCard /></RequireAdmin>} />
            <Route path="/print/nursery-bulk/:termId/:classId" element={<RequireAdmin><BulkNurseryReportCardsPage /></RequireAdmin>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </FeaturesProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </HelmetProvider>
);

export default App;
