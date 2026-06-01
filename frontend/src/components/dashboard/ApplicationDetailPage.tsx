"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Mail, Eye } from "lucide-react";
import { api } from "../../lib/api";
import {
  type JobApplicationResponse,
  type UserProfile,
} from "../../types/dtos";
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
        <div className="w-10 h-10 border-4 border-primary-200 dark:border-primary-900 border-t-primary-600 animate-spin rounded-full" />
        <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
          Loading application...
        </p>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Application Not Found
        </h2>
        <p className="text-gray-400 dark:text-gray-500 mb-6">
          {error || "The requested application could not be found."}
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
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
      className="space-y-6"
    >
      <ApplicationHeader
        application={application}
        userProfile={user as any} // AuthUser is compatible enough for display
        onDelete={handleDelete}
        onDownloadPdf={() =>
          downloadResumePdf(
            application.id,
            application.jobId,
            application.position,
            user?.fullName || "Candidate",
          )
        }
        onDownloadDocx={() =>
          downloadResumeDocx(
            application.id,
            application.jobId,
            application.position,
            user?.fullName || "Candidate",
          )
        }
      />

      {/* Content Tabs */}
      <motion.div variants={fadeInUp} className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Job Description */}
        <div className="lg:col-span-1 space-y-4">
          <JobDescriptionCard jobDescription={application.jobDescription} />
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5 h-[100vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 p-1 bg-gray-100/80 dark:bg-zinc-800/80 rounded-full">
                <button
                  onClick={() => setActiveTab("resume")}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    activeTab === "resume"
                      ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <FileText size={14} />
                  Resume
                </button>
                <button
                  onClick={() => setActiveTab("coverLetter")}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    activeTab === "coverLetter"
                      ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <Mail size={14} />
                  Cover Letter
                  {application.hasCoverLetter && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1" />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("pdfPreview")}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                    activeTab === "pdfPreview"
                      ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  <Eye size={14} />
                  PDF Preview
                </button>
              </div>
            </div>

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
