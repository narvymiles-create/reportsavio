import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-accent" />
            Coming next
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>This module is part of the v1 plan and ships in the next steps:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Classes & Streams + Teachers + Subjects</li>
            <li>Learners + Terms</li>
            <li>Grading + Division + Comment templates</li>
            <li>Marks entry grid with auto totals/position</li>
            <li>Signatures (per class + head teacher)</li>
            <li>Report card PDF edge function (single + bulk)</li>
          </ol>
          <p className="pt-2">Ask Lovable to "continue with the next phase" to build it.</p>
        </CardContent>
      </Card>
    </div>
  );
}
