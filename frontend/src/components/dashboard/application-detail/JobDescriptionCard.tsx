"use client";

import { Briefcase } from "lucide-react";

interface JobDescriptionCardProps {
  jobDescription: string;
}

export function JobDescriptionCard({
  jobDescription,
}: JobDescriptionCardProps) {
  return (
    <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5 h-full flex flex-col">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 tracking-tight">
        <Briefcase size={18} className="text-primary-500" />
        Job Description
      </h3>
      <div className="bg-gray-50/80 dark:bg-zinc-800/50 rounded-xl p-4 flex-1 border border-gray-200/60 dark:border-gray-700/60 overflow-y-auto max-h-125">
        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
          {jobDescription}
        </p>
      </div>
    </div>
  );
}
