"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  MapPin,
  Trash2,
  Briefcase,
  Hash,
  Copy,
  Check,
  Mail,
  AlertTriangle,
  Eye,
  RotateCcw,
  Save,
  Pencil,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import {
  type JobApplicationResponse,
  ApplicationStatus,
  type UserProfile,
} from "../../types/dtos";
import { getFormattedFilename } from "../../lib/utils";
import { DownloadDropdown } from "../DownloadDropdown";
import { ConfirmModal } from "../ConfirmModal";
import { useToast } from "../../context/ToastContext";

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

export default function ApplicationDetailPage({
  id,
}: ApplicationDetailPageProps) {
  const router = useRouter();
  const [application, setApplication] = useState<JobApplicationResponse | null>(
    null,
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "resume" | "coverLetter" | "pdfPreview"
  >("resume");
  const [copied, setCopied] = useState(false);

  const [editingResume, setEditingResume] = useState(false);
  const [editingCoverLetter, setEditingCoverLetter] = useState(false);
  const [resumeDraft, setResumeDraft] = useState("");
  const [coverLetterDraft, setCoverLetterDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const toast = useToast();

  const compilePdfPreview = useCallback(async (appId: number) => {
    setPdfLoading(true);
    setPdfError(null);
    setPdfBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const blob = await api.resumes.downloadPdf(appId);
      if (blob.size === 0) {
        setPdfError("PDF compilation failed. The LaTeX may contain errors.");
        return;
      }
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch {
      setPdfError("Failed to compile PDF preview.");
    } finally {
      setPdfLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

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
    api.profile.get().then(setUserProfile).catch(console.error);
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

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditResume = () => {
    setResumeDraft(application?.generatedResumeContent || "");
    setEditingResume(true);
    setSaveMsg(null);
  };

  const startEditCoverLetter = () => {
    setCoverLetterDraft(application?.coverLetterContent || "");
    setEditingCoverLetter(true);
    setSaveMsg(null);
  };

  const cancelEditResume = () => {
    setEditingResume(false);
    setResumeDraft("");
    setSaveMsg(null);
  };

  const cancelEditCoverLetter = () => {
    setEditingCoverLetter(false);
    setCoverLetterDraft("");
    setSaveMsg(null);
  };

  const handleSaveResume = async () => {
    if (!application) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.resumes.updateContent(application.id, resumeDraft, null);
      setApplication({
        ...application,
        generatedResumeContent: resumeDraft,
        hasGeneratedResume: true,
      });
      setEditingResume(false);
      setSaveMsg({ type: "success", text: "Resume saved" });
      if (pdfBlobUrl) compilePdfPreview(application.id);
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save resume" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const handleSaveCoverLetter = async () => {
    if (!application) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.resumes.updateContent(application.id, null, coverLetterDraft);
      setApplication({
        ...application,
        coverLetterContent: coverLetterDraft,
        hasCoverLetter: true,
      });
      setEditingCoverLetter(false);
      setSaveMsg({ type: "success", text: "Cover letter saved" });
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save cover letter" });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  };

  const handleDownloadPdf = async () => {
    if (!application) return;
    try {
      const blob = await api.resumes.downloadPdf(application.id);
      if (blob.size === 0) {
        toast.error("PDF compilation failed. The LaTeX may contain errors.");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFormattedFilename(
        userProfile?.fullName || "Candidate",
        application.jobId,
        application.company,
        "Resume",
      );
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to download PDF. Please try again.",
      );
    }
  };

  const handleDownloadCoverLetterPdf = async () => {
    if (!application) return;
    try {
      const blob = await api.resumes.downloadCoverLetterPdf(application.id);
      if (blob.size === 0) {
        toast.error("PDF compilation failed.");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFormattedFilename(
        userProfile?.fullName || "Candidate",
        application.jobId,
        application.company,
        "Cover_Letter",
        "pdf",
      );
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download PDF.");
    }
  };

  const handleDownloadCoverLetterDocx = async () => {
    if (!application) return;
    try {
      const blob = await api.resumes.downloadCoverLetterDocx(application.id);
      if (blob.size === 0) {
        toast.error("Word document generation failed.");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFormattedFilename(
        userProfile?.fullName || "Candidate",
        application.jobId,
        application.company,
        "Cover_Letter",
        "docx",
      );
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download Word document.");
    }
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
      <motion.div variants={fadeInUp}>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
      </motion.div>

      {/* Header Card */}
      <motion.div
        variants={fadeInUp}
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
                {(() => {
                  const status = getStatusConfig(application.outcome);
                  return (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${status.bg} ${status.text} ${status.border}`}
                    >
                      {status.label}
                    </span>
                  );
                })()}
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
              <button
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
              >
                <FileText size={16} />
                Download PDF
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2.5 rounded-full border border-red-200/60 dark:border-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Content Tabs */}
      <motion.div variants={fadeInUp} className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Job Description */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5 h-full flex flex-col">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2 tracking-tight">
              <Briefcase size={18} className="text-primary-500" />
              Job Description
            </h3>
            <div className="bg-gray-50/80 dark:bg-zinc-800/50 rounded-xl p-4 flex-1 border border-gray-200/60 dark:border-gray-700/60 overflow-y-auto max-h-125">
              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {application.jobDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5 min-h-[calc(100vh-200px)] flex flex-col">
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
                  onClick={() => {
                    setActiveTab("pdfPreview");
                    if (
                      !pdfBlobUrl &&
                      !pdfLoading &&
                      application.hasGeneratedResume
                    ) {
                      compilePdfPreview(application.id);
                    }
                  }}
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

            {/* Resume Tab Content */}
            {activeTab === "resume" && (
              <div className="flex-1 flex flex-col">
                {application.hasGeneratedResume &&
                application.generatedResumeContent ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        {editingResume ? "Editing LaTeX" : "Generated LaTeX"}
                      </label>
                      <div className="flex items-center gap-2">
                        {saveMsg && activeTab === "resume" && (
                          <span
                            className={`text-xs font-medium ${saveMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}
                          >
                            {saveMsg.text}
                          </span>
                        )}
                        {editingResume ? (
                          <>
                            <button
                              onClick={cancelEditResume}
                              className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                            >
                              <X size={14} /> Cancel
                            </button>
                            <button
                              onClick={handleSaveResume}
                              disabled={saving}
                              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold gap-1.5 inline-flex items-center transition-all"
                            >
                              <Save size={14} /> {saving ? "Saving..." : "Save"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={startEditResume}
                              className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() =>
                                handleCopy(application.generatedResumeContent!)
                              }
                              className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                            >
                              {copied ? (
                                <Check size={14} className="text-emerald-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                              {copied ? "Copied!" : "Copy"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <textarea
                      readOnly={!editingResume}
                      className={`flex-1 w-full px-4 py-3 border rounded-2xl font-mono text-xs resize-none transition-colors focus:outline-none ${
                        editingResume
                          ? "bg-white dark:bg-zinc-900 border-primary-300 dark:border-primary-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900/30"
                          : "bg-gray-50/80 dark:bg-zinc-800/50 border-gray-200/60 dark:border-gray-800/60 text-gray-700 dark:text-gray-300"
                      }`}
                      value={
                        editingResume
                          ? resumeDraft
                          : application.generatedResumeContent
                      }
                      onChange={(e) => setResumeDraft(e.target.value)}
                    />
                  </>
                ) : (
                  <div className="flex-1 bg-gray-50/80 dark:bg-zinc-800/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 flex items-center justify-center">
                    <div className="text-center p-8">
                      <FileText
                        size={48}
                        className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
                      />
                      <p className="text-gray-400 dark:text-gray-500 font-medium mb-2">
                        No Resume Generated
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                        Generate a resume from the New Application page.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cover Letter Tab Content */}
            {activeTab === "coverLetter" && (
              <div className="flex-1 flex flex-col">
                {application.hasCoverLetter &&
                application.coverLetterContent ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        {editingCoverLetter
                          ? "Editing Cover Letter"
                          : "Generated Cover Letter"}
                      </label>
                      <div className="flex items-center gap-2">
                        {saveMsg && activeTab === "coverLetter" && (
                          <span
                            className={`text-xs font-medium ${saveMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}
                          >
                            {saveMsg.text}
                          </span>
                        )}
                        {editingCoverLetter ? (
                          <>
                            <button
                              onClick={cancelEditCoverLetter}
                              className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                            >
                              <X size={14} /> Cancel
                            </button>
                            <button
                              onClick={handleSaveCoverLetter}
                              disabled={saving}
                              className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold gap-1.5 inline-flex items-center transition-all"
                            >
                              <Save size={14} /> {saving ? "Saving..." : "Save"}
                            </button>
                          </>
                        ) : (
                          <>
                            <DownloadDropdown
                              onDownloadPdf={handleDownloadCoverLetterPdf}
                              onDownloadDocx={handleDownloadCoverLetterDocx}
                              label="Download"
                              size="sm"
                              variant="ghost"
                            />
                            <button
                              onClick={startEditCoverLetter}
                              className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() =>
                                handleCopy(application.coverLetterContent!)
                              }
                              className="px-3 py-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-xs gap-1.5 inline-flex items-center transition-colors"
                            >
                              {copied ? (
                                <Check size={14} className="text-emerald-500" />
                              ) : (
                                <Copy size={14} />
                              )}
                              {copied ? "Copied!" : "Copy"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingCoverLetter ? (
                      <textarea
                        className="flex-1 w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-primary-300 dark:border-primary-700 rounded-2xl text-sm text-gray-900 dark:text-white font-sans leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900/30 transition-colors"
                        value={coverLetterDraft}
                        onChange={(e) => setCoverLetterDraft(e.target.value)}
                      />
                    ) : (
                      <div className="flex-1 bg-white/80 dark:bg-zinc-900/80 border border-gray-200/60 dark:border-gray-800/60 rounded-2xl p-6 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white font-sans leading-relaxed">
                          {application.coverLetterContent}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 bg-gray-50/80 dark:bg-zinc-800/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 flex items-center justify-center">
                    <div className="text-center p-8">
                      <Mail
                        size={48}
                        className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
                      />
                      <p className="text-gray-400 dark:text-gray-500 font-medium mb-2">
                        No Cover Letter Generated
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                        Set up your profile in Settings to enable personalized
                        cover letters.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PDF Preview Tab Content */}
            {activeTab === "pdfPreview" && (
              <div className="flex-1 flex flex-col">
                {application.hasGeneratedResume ? (
                  <div
                    className="flex-1 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 overflow-hidden bg-gray-100 dark:bg-zinc-800 ring-1 ring-gray-900/5 dark:ring-white/5"
                    style={{ minHeight: "calc(100vh - 320px)" }}
                  >
                    {pdfLoading && (
                      <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                        <div className="w-10 h-10 rounded-full border-4 border-primary-200 dark:border-primary-900 border-t-primary-600 animate-spin" />
                        <p className="text-sm text-gray-400 dark:text-gray-500 font-medium animate-pulse">
                          Compiling PDF...
                        </p>
                      </div>
                    )}
                    {pdfError && (
                      <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                        <AlertTriangle size={32} className="text-amber-400" />
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center max-w-xs">
                          {pdfError}
                        </p>
                        <button
                          onClick={() => compilePdfPreview(application.id)}
                          className="px-4 py-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 text-sm text-primary-600 dark:text-primary-400 flex items-center gap-2 transition-colors"
                        >
                          <RotateCcw size={14} />
                          Retry
                        </button>
                      </div>
                    )}
                    {pdfBlobUrl && !pdfLoading && !pdfError && (
                      <iframe
                        src={pdfBlobUrl}
                        title="Resume PDF Preview"
                        className="w-full h-full border-0"
                        style={{ minHeight: "calc(100vh - 320px)" }}
                      />
                    )}
                    {!pdfBlobUrl && !pdfLoading && !pdfError && (
                      <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                        <Eye
                          size={32}
                          className="text-gray-300 dark:text-gray-600"
                        />
                        <p className="text-sm text-gray-400 dark:text-gray-500">
                          Click to load PDF preview
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 bg-gray-50/80 dark:bg-zinc-800/50 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 flex items-center justify-center">
                    <div className="text-center p-8">
                      <FileText
                        size={48}
                        className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
                      />
                      <p className="text-gray-400 dark:text-gray-500 font-medium mb-2">
                        No Resume Generated
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                        Generate a resume from the New Application page.
                      </p>
                    </div>
                  </div>
                )}
              </div>
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
