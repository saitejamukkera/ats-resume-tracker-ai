"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Mail, Eye } from "lucide-react";
import { api } from "../../lib/api";
import { type JobApplicationResponse, type UserProfile } from "../../types/dtos";
import { ConfirmModal } from "../ConfirmModal";
import { useToast } from "../../context/ToastContext";
import { useDownloader } from "../../hooks/useDownloader";
import { useAuth } from "../../context/AuthContext";
import { ApplicationHeader } from "./application-detail/ApplicationHeader";
import { JobDescriptionCard } from "./application-detail/JobDescriptionCard";
import { ResumeEditor } from "./application-detail/ResumeEditor";
import { CoverLetterEditor } from "./application-detail/CoverLetterEditor";
import { PdfPreview } from "./application-detail/PdfPreview";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

interface ApplicationDetailPageProps {
  id: number;
}

export default function ApplicationDetailPage({
  id,
}: ApplicationDetailPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [application, setApplication] = useState<JobApplicationResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "resume" | "coverLetter" | "pdfPreview"
  >("resume");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const toast = useToast();
  const {
    downloadResumePdf,
    downloadResumeDocx,
    downloadCoverLetterPdf,
    downloadCoverLetterDocx,
  } = useDownloader();

  useEffect(() => {
    if (!id) return;
    const fetchApp = async () => {
      try {
        const data = await api.applications.getById(id);
        setApplication(data);
      } catch (err) {
        setError("Failed to load application details.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchApp();
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!id) return;
    setShowDeleteConfirm(false);
    try {
      await api.applications.delete(id);
      toast.success("Application deleted successfully.");
      router.push("/dashboard");
    } catch (err) {
      toast.error("Failed to delete application. Please try again.");
      console.error(err);
    }
  };

  const handleResumeUpdate = (newContent: string) => {
    if (!application) return;
    setApplication({
      ...application,
      generatedResumeContent: newContent,
      hasGeneratedResume: true,
    });
  };

  const handleCoverLetterUpdate = (newContent: string) => {
    if (!application) return;
    setApplication({
      ...application,
      coverLetterContent: newContent,
      hasCoverLetter: true,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="loading-spinner" aria-hidden="true" />
        <p className="text-sm font-medium text-text-muted">
          Loading Application…
        </p>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2 className="mb-2 font-display text-3xl font-medium text-text-primary">
          Application Not Found
        </h2>
        <p className="mb-6 text-text-secondary">
          {error || "The requested application could not be found."}
        </p>
        <Link
          href="/dashboard"
          className="button-primary px-6"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="application-detail-screen"
    >
      <ApplicationHeader
        application={application}
        userProfile={
          user
            ? ({ fullName: user.fullName, email: user.email } as UserProfile)
            : null
        }
        onDelete={handleDelete}
        onDownloadPdf={() =>
          downloadResumePdf(
            application.id,
            application.jobId,
            application.company,
            user?.fullName || "Candidate",
          )
        }
        onDownloadDocx={() =>
          downloadResumeDocx(
            application.id,
            application.jobId,
            application.company,
            user?.fullName || "Candidate",
          )
        }
      />

      <motion.div variants={fadeInUp} className="application-detail-content">
        {/* Left Column: Job Description */}
        <div className="application-detail-job">
          <JobDescriptionCard jobDescription={application.jobDescription} />
        </div>

        <div className="application-detail-editor">
            <div className="application-detail-tabs">
                <button
                  onClick={() => setActiveTab("resume")}
                  className={`application-detail-tab ${
                    activeTab === "resume"
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <FileText size={14} />
                  Resume
                </button>
                <button
                  onClick={() => setActiveTab("coverLetter")}
                  className={`application-detail-tab ${
                    activeTab === "coverLetter"
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Mail size={14} />
                  Cover Letter
                </button>
                <button
                  onClick={() => setActiveTab("pdfPreview")}
                  className={`application-detail-tab ${
                    activeTab === "pdfPreview"
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Eye size={14} />
                  PDF Preview
                </button>
            </div>

          <div className="application-detail-editor-surface surface">

            {activeTab === "resume" && (
              <ResumeEditor
                applicationId={application.id}
                initialContent={application.generatedResumeContent || null}
                hasGeneratedResume={application.hasGeneratedResume}
                onContentUpdate={handleResumeUpdate}
              />
            )}

            {activeTab === "coverLetter" && (
              <CoverLetterEditor
                applicationId={application.id}
                initialContent={application.coverLetterContent || null}
                hasCoverLetter={application.hasCoverLetter}
                onContentUpdate={handleCoverLetterUpdate}
                onDownloadPdf={() =>
                  downloadCoverLetterPdf(
                    application.id,
                    application.jobId,
                    application.company,
                    user?.fullName || "Candidate",
                  )
                }
                onDownloadDocx={() =>
                  downloadCoverLetterDocx(
                    application.id,
                    application.jobId,
                    application.company,
                    user?.fullName || "Candidate",
                  )
                }
              />
            )}

            {activeTab === "pdfPreview" && (
              <PdfPreview
                applicationId={application.id}
                hasGeneratedResume={application.hasGeneratedResume}
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Application"
        message="Are you sure you want to delete this application? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        icon="delete"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </motion.div>
  );
}
