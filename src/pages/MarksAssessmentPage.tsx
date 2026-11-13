import { useParams } from "react-router-dom";
import MarksFormPage from "./MarksFormPage";
export default function MarksAssessmentPage() {
  const { assessment = "" } = useParams();
  return <MarksFormPage key={assessment} exam={assessment} />;
}
