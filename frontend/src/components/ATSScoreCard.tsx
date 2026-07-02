"use client";

import type { ScoreComponent } from "@/lib/api";

interface ATSScoreCardProps {
  overallScore: number;
  impactScore: number;
  breakdown: Record<string, ScoreComponent>;
  missingRequired?: string[];
  missingPreferred?: string[];
}

export function ATSScoreCard({
  overallScore,
  impactScore,
  breakdown,
  missingRequired,
  missingPreferred,
}: ATSScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getProgressColor = (ratio: number) => {
    if (ratio >= 0.8) return "bg-green-500";
    if (ratio >= 0.6) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">ATS Score</h3>
        <span className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
          {overallScore}
          <span className="text-sm font-normal text-muted-foreground">
            /100
          </span>
        </span>
      </div>

      {impactScore > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Impact Score</span>
          <span className={`font-medium ${getScoreColor(impactScore)}`}>
            {impactScore}/100
          </span>
        </div>
      )}

      {Object.keys(breakdown).length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Score Breakdown
          </h4>
          {Object.entries(breakdown).map(([key, comp]) => (
            <div key={key} className="space-y-0.5">
              <div className="flex justify-between text-xs">
                <span>{comp.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {comp.weighted}/{comp.max}
                </span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getProgressColor(comp.max > 0 ? comp.weighted / comp.max : 0)}`}
                  style={{
                    width: `${comp.max > 0 ? (comp.weighted / comp.max) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {(missingRequired && missingRequired.length > 0) ||
      (missingPreferred && missingPreferred.length > 0) ? (
        <div className="space-y-1 text-xs">
          {missingRequired && missingRequired.length > 0 && (
            <p className="text-red-500">
              <span className="font-medium">Required skills not detected</span> — add
              these to your base resume if you have them, they are likely knockout
              filters: {missingRequired.join(", ")}
            </p>
          )}
          {missingPreferred && missingPreferred.length > 0 && (
            <p className="text-yellow-600">
              <span className="font-medium">Preferred (bonus) missing</span>:{" "}
              {missingPreferred.join(", ")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
