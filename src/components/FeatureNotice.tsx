import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useFeatures } from "@/contexts/FeaturesContext";
import { FEATURE_LABELS, type FeatureKey } from "@/lib/features";

/** Banner listing switched-off features on a page that stays viewable (changes are refused by the database). */
export function FeatureNotice({ keys }: { keys: FeatureKey[] }) {
  const { enabled } = useFeatures();
  const off = keys.filter((k) => !enabled(k));
  if (!off.length) return null;
  return (
    <Alert className="mb-4">
      <Lock className="h-4 w-4" />
      <AlertTitle>Turned off by Skavio</AlertTitle>
      <AlertDescription>{off.map((k) => FEATURE_LABELS[k]).join(", ")} {off.length === 1 ? "is" : "are"} turned off for your school. You can still view your information; nothing has been deleted. Contact Skavio to turn {off.length === 1 ? "it" : "them"} back on.</AlertDescription>
    </Alert>
  );
}

/** Hides a whole page when its feature is switched off. */
export function FeaturePage({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { enabled } = useFeatures();
  if (enabled(feature)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-lg py-16 text-center space-y-2">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{FEATURE_LABELS[feature]} is turned off</h1>
      <p className="text-muted-foreground">Skavio has turned this feature off for your school. Your existing data and templates are kept and come back when it is turned on again.</p>
    </div>
  );
}
