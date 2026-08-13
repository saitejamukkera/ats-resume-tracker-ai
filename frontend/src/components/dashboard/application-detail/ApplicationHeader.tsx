"use client";

import { MapPin, Tag, Calendar, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ApplicationStatus,
  type JobApplicationResponse,
  type UserProfile,
} from "../../../types/dtos";
import { DownloadDropdown } from "../../DownloadDropdown";

const STATUS_LABELS: Record<string, string> = {
  [ApplicationStatus.ACTIVE]: "Active",
  [ApplicationStatus.IN_PROCESS]: "In Process",
  [ApplicationStatus.REJECTED]: "Rejected",
  [ApplicationStatus.OFFER_RECEIVED]: "Offer Received",
};

function getStatusLabel(status: ApplicationStatus) {
  return STATUS_LABELS[status] || status || "Draft";
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
  onDelete,
  onDownloadPdf,
  onDownloadDocx,
}: ApplicationHeaderProps) {
  const statusLabel = getStatusLabel(application.outcome);
  const appliedDate = new Date(
    application.appliedOn.includes("T")
      ? application.appliedOn
      : `${application.appliedOn}T00:00:00`,
  ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <header className="application-detail-header">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link
          href="/dashboard"
          className="application-detail-back"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="application-detail-summary"
      >
        <div className="application-detail-title-row">
          <div>
            <h1 className="page-title">{application.position}</h1>
            <p className="application-detail-company">
              <span aria-hidden="true">A</span>
              {application.company}
            </p>
          </div>

          <div className="application-detail-actions">
            {application.hasGeneratedResume && (
              <DownloadDropdown
                label="Download Resume"
                onDownloadPdf={onDownloadPdf}
                onDownloadDocx={onDownloadDocx}
                variant="ghost"
              />
            )}
            <button onClick={onDelete} className="application-delete-button" aria-label="Delete application">
              <Trash2 size={18} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>

        <div className="application-detail-metadata">
          <div><MapPin size={18} aria-hidden="true" />{application.location || "Remote / Unspecified"}</div>
          <div><Tag size={18} aria-hidden="true" />Job ID: {application.jobId || "N/A"}</div>
          <div><Calendar size={18} aria-hidden="true" />Applied: {appliedDate}</div>
          <span className={`status-control ${application.outcome === ApplicationStatus.ACTIVE || application.outcome === ApplicationStatus.OFFER_RECEIVED ? "status-active" : application.outcome === ApplicationStatus.IN_PROCESS ? "status-progress" : "status-rejected"}`}>
            {statusLabel}
          </span>
            </div>
      </motion.div>
    </header>
  );
}
