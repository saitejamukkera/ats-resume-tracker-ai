"use client";

import {
  Building2,
  MapPin,
  Hash,
  Calendar,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ApplicationStatus,
  type JobApplicationResponse,
  type UserProfile,
} from "../../../types/dtos";
import { DownloadDropdown } from "../../DownloadDropdown";

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; label: string }
> = {
  [ApplicationStatus.ACTIVE]: {
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200/60 dark:border-emerald-800/60",
    label: "Active",
  },
  [ApplicationStatus.IN_PROCESS]: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200/60 dark:border-blue-800/60",
    label: "In Process",
  },
  [ApplicationStatus.REJECTED]: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200/60 dark:border-red-800/60",
    label: "Rejected",
  },
  [ApplicationStatus.OFFER_RECEIVED]: {
    bg: "bg-violet-50 dark:bg-violet-900/20",
    text: "text-violet-700 dark:text-violet-400",
    border: "border-violet-200/60 dark:border-violet-800/60",
    label: "Offer Received",
  },
};

const DEFAULT_STATUS_CONFIG = {
  bg: "bg-gray-50 dark:bg-zinc-800/50",
  text: "text-gray-700 dark:text-gray-300",
  border: "border-gray-200/60 dark:border-gray-700/60",
  label: "Draft",
};

function getStatusConfig(status: ApplicationStatus) {
  return STATUS_CONFIG[status] || { ...DEFAULT_STATUS_CONFIG, label: status };
}

interface ApplicationHeaderProps {
  application: JobApplicationResponse;
  userProfile: UserProfile | null;
  onDelete: () => void;
  onDownloadPdf: () => Promise<void>;
  onDownloadDocx: () => Promise<void>;
}

export function ApplicationHeader({
  application,
  userProfile,
  onDelete,
  onDownloadPdf,
  onDownloadDocx,
}: ApplicationHeaderProps) {
  const status = getStatusConfig(application.outcome);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="p-6 lg:p-8 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
      >
        <div className="flex flex-col lg:flex-row justify-between lg:items-start gap-6">
          <div className="space-y-4 flex-1">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-extrabold tracking-tight">
                  <span className="bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                    {application.position}
                  </span>
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${status.bg} ${status.text} ${status.border}`}
                >
                  {status.label}
                </span>
              </div>
              <div className="flex items-center gap-2 text-lg text-gray-600 dark:text-gray-300 font-medium">
                <Building2 size={18} className="text-primary-500" />
                {application.company}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-400 dark:text-gray-500">
              <div className="flex items-center gap-1.5">
                <MapPin size={14} />
                {application.location || "Remote / Unspecified"}
              </div>
              <div className="flex items-center gap-1.5">
                <Hash size={14} />
                Job ID: {application.jobId || "N/A"}
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} />
                Applied: {new Date(application.appliedOn).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="flex gap-3 shrink-0">
            {application.hasGeneratedResume && (
              <DownloadDropdown
                label="Download Resume"
                onDownloadPdf={onDownloadPdf}
                onDownloadDocx={onDownloadDocx}
              />
            )}
            <button
              onClick={onDelete}
              className="p-2.5 rounded-full border border-red-200/60 dark:border-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
