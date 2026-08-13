"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  Loader2,
  Sparkles,
  RotateCcw,
  Mail,
  Check,
  MapPin,
  Building2,
  Hash,
  Briefcase,
  AlertTriangle,
  Copy,
  Maximize2,
} from "lucide-react";
import Drawer from "../ui/Drawer";
import ResizableSplitView from "../ui/ResizableSplitView";
import { DownloadDropdown } from "../DownloadDropdown";
import { DuplicateJobModal } from "../DuplicateJobModal";
import { useDownloader } from "@/hooks/useDownloader";
import { api, type GenerateFromJdResponse } from "@/lib/api";
import type { UserProfile } from "@/types/dtos";
import { useToast } from "@/context/ToastContext";
import { useApiKeys } from "@/hooks/useApiKeys";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export default function NewApplicationPage() {
  const [loading, setLoading] = useState(false);
  const [streamStage, setStreamStage] = useState<string>("");
  const [hasBaseResumes, setHasBaseResumes] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const toast = useToast();
  const { getApiKeys } = useApiKeys();
  const {
    downloadResumePdf,
    downloadResumeDocx,
    downloadCoverLetterPdf,
    downloadCoverLetterDocx,
  } = useDownloader();

  const [generated, setGenerated] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    position: "",
    company: "",
    jobId: "",
    location: "",
  });
  const [jobDescription, setJobDescription] = useState("");
  const [useIconResume, setUseIconResume] = useState(false);
  const [result, setResult] = useState<GenerateFromJdResponse | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedGenerated = localStorage.getItem("newApp_generated");
    if (savedGenerated) setGenerated(JSON.parse(savedGenerated));

    const savedIsEditing = localStorage.getItem("newApp_isEditing");
    if (savedIsEditing) setIsEditing(JSON.parse(savedIsEditing));

    const savedFormData = localStorage.getItem("newApp_formData");
    if (savedFormData) setFormData(JSON.parse(savedFormData));

    const savedJd = localStorage.getItem("newApp_jobDescription");
    if (savedJd) setJobDescription(savedJd);

    const savedUseIcon = localStorage.getItem("newApp_useIconResume");
    if (savedUseIcon) setUseIconResume(JSON.parse(savedUseIcon));

    const savedResult = localStorage.getItem("newApp_result");
    if (savedResult) setResult(JSON.parse(savedResult));
  }, []);

  const [activeTab, setActiveTab] = useState<"resume" | "coverLetter">(
    "resume",
  );
  const [copied, setCopied] = useState(false);

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [useIconResumeRegen, setUseIconResumeRegen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateApp, setDuplicateApp] = useState<{
    id: number;
    position: string;
    company: string;
    appliedOn: string;
  } | null>(null);

  const compilePdfPreview = useCallback(async (applicationId: number) => {
    setPdfLoading(true);
    setPdfError(null);
    setPdfBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const blob = await api.resumes.downloadPdf(applicationId);
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
    if (!mounted) return;
    localStorage.setItem("newApp_generated", JSON.stringify(generated));
    localStorage.setItem("newApp_isEditing", JSON.stringify(isEditing));
    localStorage.setItem("newApp_formData", JSON.stringify(formData));
    localStorage.setItem("newApp_jobDescription", jobDescription);
    localStorage.setItem("newApp_useIconResume", JSON.stringify(useIconResume));
    localStorage.setItem("newApp_result", JSON.stringify(result));
  }, [
    generated,
    isEditing,
    formData,
    jobDescription,
    useIconResume,
    result,
    mounted,
  ]);

  const clearStorage = () => {
    localStorage.removeItem("newApp_generated");
    localStorage.removeItem("newApp_isEditing");
    localStorage.removeItem("newApp_formData");
    localStorage.removeItem("newApp_jobDescription");
    localStorage.removeItem("newApp_useIconResume");
    localStorage.removeItem("newApp_result");
  };

  useEffect(() => {
    if (!mounted) return;
    const checkBaseResumes = async () => {
      try {
        const count = await api.resumes.getBaseResumeCount();
        setHasBaseResumes(count > 0);
      } catch {
        setHasBaseResumes(null);
      }
    };
    checkBaseResumes();

    api.profile.get().then(setUserProfile).catch(console.error);

    if (result?.applicationId) {
      compilePdfPreview(result.applicationId);
    }
  }, [mounted, result?.applicationId, compilePdfPreview]);

  useEffect(() => {
    if (!result?.latexContent || !result?.applicationId) return;

    const appId = result.applicationId;
    const latexContent = result.latexContent;
    const coverLetterContent = result.coverLetterContent;

    const timeoutId = setTimeout(async () => {
      setPdfLoading(true);
      try {
        await api.resumes.updateContent(
          appId,
          latexContent,
          coverLetterContent,
        );
        await compilePdfPreview(appId);
      } catch {
        // no-op
      } finally {
        setPdfLoading(false);
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [
    result?.latexContent,
    result?.applicationId,
    result?.coverLetterContent,
    compilePdfPreview,
  ]);

  const doGenerate = async () => {
    setLoading(true);
    setStreamStage("Connecting...");
    try {
      const byok = getApiKeys();
      await api.resumes.generateFromJdStream(
        jobDescription,
        useIconResume,
        (eventType, data) => {
          switch (eventType) {
            case "stage-start": {
              const stageLabels: Record<string, string> = {
                "latex-parser": "Parsing your base resume...",
                "jd-parser": "Analyzing job description...",
                generators: "Rewriting resume sections...",
                validator: "Validating & optimizing content...",
                "latex-assembler": "Assembling final LaTeX...",
              };
              setStreamStage(
                stageLabels[(data.stage as string) || ""] || "Processing...",
              );
              break;
            }
            case "jd-parsed":
              setFormData({
                position: (data.position as string) || "Unknown Position",
                company: (data.company as string) || "Unknown Company",
                jobId: (data.jobId as string) || "",
                location: (data.location as string) || "",
              });
              setStreamStage(
                `Generating resume for ${data.position || "position"} at ${data.company || "company"}...`,
              );
              break;
            case "resume-ready":
              setResult({
                applicationId: data.applicationId as number,
                position: (data.position as string) || formData.position,
                company: (data.company as string) || formData.company,
                jobId: (data.jobId as string) || formData.jobId,
                location: (data.location as string) || formData.location,
                latexContent: (data.latex as string) || "",
                coverLetterContent: "",
              });
              setGenerated(true);
              setIsEditing(true);
              setIsDrawerOpen(true);
              compilePdfPreview(data.applicationId as number);
              setStreamStage("Generating cover letter...");
              break;
            case "complete":
              if (data.coverLetter) {
                setResult((prev) =>
                  prev
                    ? {
                        ...prev,
                        coverLetterContent: data.coverLetter as string,
                      }
                    : null,
                );
              }
              setLoading(false);
              setStreamStage("");
              break;
            case "error":
              if (data.rateLimited) {
                const seconds = (data.retryAfterSeconds as number) || 30;
                toast.error(
                  `API rate limit exceeded. Please try again in ${seconds} seconds.`,
                );
              } else {
                toast.error((data.error as string) || "Generation failed.");
              }
              setLoading(false);
              setStreamStage("");
              break;
          }
        },
        byok?.apiKeys,
        byok?.llmProvider,
      );
      // Stream ended — ensure loading is off
      setLoading(false);
      setStreamStage("");
    } catch (error) {
      console.error(error);
      toast.error(
        "Failed to generate. Ensure base resumes are uploaded in Settings and the backend is running.",
      );
      setLoading(false);
      setStreamStage("");
    }
  };

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      toast.warning("Please paste a job description.");
      return;
    }

    console.log("=== DUPE-CHECK START === jdLength:", jobDescription.length);
    setCheckingDuplicate(true);
    try {
      const byok = getApiKeys();
      const check = await api.applications.checkDuplicate(jobDescription, byok?.apiKeys, byok?.llmProvider);
      console.log("=== DUPE-CHECK RESULT ===", JSON.stringify(check));
      if (check.duplicate && check.existingApplication) {
        console.log("=== DUPE-CHECK === DUPLICATE FOUND:", check.existingApplication);
        setDuplicateApp(check.existingApplication);
        setShowDuplicateModal(true);
        setCheckingDuplicate(false);
        return;
      }
      console.log("=== DUPE-CHECK === NO DUPLICATE, proceeding to generate");
      setCheckingDuplicate(false);
      await doGenerate();
    } catch (error) {
      console.error("=== DUPE-CHECK ERROR ===", error);
      toast.error("Failed to check for duplicate applications.");
      setCheckingDuplicate(false);
    }
  };

  const handleConfirmDuplicate = () => {
    setShowDuplicateModal(false);
    setDuplicateApp(null);
    doGenerate();
  };

  const handleCancelDuplicate = () => {
    setShowDuplicateModal(false);
    setDuplicateApp(null);
    setJobDescription("");
    localStorage.removeItem("newApp_jobDescription");
  };

  const handleRegenerate = async () => {
    if (!result) return;
    setLoading(true);
    try {
      const byok = getApiKeys();
      const response = await api.resumes.generate(result.applicationId, {
        jobDescription,
        customPrompt: customPrompt.trim() || undefined,
        useIconResume: useIconResumeRegen,
      }, byok?.apiKeys, byok?.llmProvider);
      setResult((prev) =>
        prev
          ? {
              ...prev,
              latexContent: response.latexContent,
              coverLetterContent: response.coverLetterContent,
            }
          : null,
      );
      if (result) compilePdfPreview(result.applicationId);
      if (customPrompt.trim()) {
        toast.success("Resume regenerated with your instructions.");
      }
      setCustomPrompt("");
      setShowPromptInput(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to regenerate.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApp = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      await api.resumes.updateContent(
        result.applicationId,
        result.latexContent,
        result.coverLetterContent,
      );

      await api.applications.update(result.applicationId, {
        ...formData,
        jobDescription: jobDescription,
        outcome: "ACTIVE",
      });
      setResult({
        ...result,
        ...formData,
      });
      setIsEditing(false);
      clearStorage();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save application.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePreview = async () => {
    if (!result) return;
    setPdfLoading(true);
    try {
      await api.resumes.updateContent(
        result.applicationId,
        result.latexContent,
        result.coverLetterContent,
      );
      await compilePdfPreview(result.applicationId);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update preview.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!mounted) return null;

  if (loading && !generated) {
    return (
      <div className="generation-loading-state">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="generation-loading-surface surface"
        >
          <div className="relative mb-8">
            <div className="loading-spinner" aria-hidden="true" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={20} className="text-primary-600" />
            </div>
          </div>
          <h2 className="mb-3 font-display text-3xl font-medium tracking-tight">
            {streamStage || "Analyzing Job Description…"}
          </h2>
          <p className="max-w-sm text-center text-sm font-medium leading-relaxed text-text-muted">
            {formData.position && formData.company
              ? `Tailoring for ${formData.position} at ${formData.company}`
              : "Extracting job details, rewriting your resume, and drafting a cover letter…"}
          </p>
        </motion.div>
      </div>
    );
  }

  if (!generated) {
    return (
      <motion.div
        key="input-form"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="new-application-screen"
      >
        <motion.div variants={fadeInUp}>
          <Link
            href="/dashboard"
            className="new-application-back inline-flex items-center gap-2 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
        </motion.div>

        <motion.div variants={fadeInUp} className="new-application-header">
          <h1 className="page-title">New Application</h1>
          <p className="page-description">
            Paste the job description below. TrackHire AI will extract job details and tailor your resume.
          </p>
        </motion.div>

        <motion.div
          variants={fadeInUp}
          className="new-application-form border-t border-border"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="job-description" className="field-label mb-0">
                Job Description (JD)
              </label>
            </div>
            <textarea
              id="job-description"
              name="job-description"
              autoComplete="off"
              className="field resize-y"
              placeholder="Paste full text"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          <div className="new-application-choice flex items-start gap-4">
            <input
              type="checkbox"
              id="useIconResume"
              checked={useIconResume}
              onChange={(e) => setUseIconResume(e.target.checked)}
              className="mt-0.5 h-6 w-6 rounded-[4px] border-border-strong text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <label
              htmlFor="useIconResume"
              className="cursor-pointer select-none text-base text-text-primary"
            >
              <span className="font-medium text-text-primary">
                Use Base Resume B (With Icons)
              </span>
              <span className="block text-text-muted">Default is A — No Icons</span>
            </label>
          </div>

          {hasBaseResumes === false && (
            <div className="new-application-warning" role="status">
              <AlertTriangle size={25} aria-hidden="true" />
              <p>You haven&apos;t set up your base resumes yet.</p>
              <Link href="/settings">Open Settings</Link>
            </div>
          )}
          <div className="flex justify-start">
            <button
              onClick={handleGenerate}
              disabled={
                loading ||
                checkingDuplicate ||
                !jobDescription.trim() ||
                hasBaseResumes === false
              }
              className="button-primary new-application-submit disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkingDuplicate ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Checking Existing Applications…
                </>
              ) : loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Analyzing & Generating…
                </>
              ) : (
                <>
                  Analyze & Generate
                </>
              )}
            </button>
          </div>
        </motion.div>

        <DuplicateJobModal
          open={showDuplicateModal}
          position={duplicateApp?.position ?? ""}
          company={duplicateApp?.company ?? ""}
          appliedOn={duplicateApp?.appliedOn ?? ""}
          onConfirm={handleConfirmDuplicate}
          onCancel={handleCancelDuplicate}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      key="result-view"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="generation-result"
    >
      <motion.div variants={fadeInUp}>
        <button
          onClick={() => {
            setGenerated(false);
            setResult(null);
            setJobDescription("");
            setFormData({
              position: "",
              company: "",
              jobId: "",
              location: "",
            });
            clearStorage();
          }}
          className="generation-back"
        >
          <ArrowLeft size={16} />
          New Generation
        </button>
      </motion.div>

      {result && (
        <>
          <motion.div
            variants={fadeInUp}
            className="generation-summary surface"
          >
            <div className="generation-summary-header">
              <div
                className={`generation-state-icon ${isEditing ? "warning" : "success"}`}
              >
                <CheckCircle
                  size={20}
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2>
                  {isEditing
                    ? "Review & Confirm Details"
                    : "Application Confirmed"}
                </h2>
                <p>
                  {isEditing
                    ? "Please verify the extracted information before saving."
                    : "Application details have been saved successfully."}
                </p>
              </div>
              <div className="generation-summary-actions">
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className="button-secondary"
                >
                  <Maximize2 size={16} />
                  Open Editor
                </button>
                {isEditing ? (
                  <button
                    onClick={handleSaveApp}
                    disabled={loading || isSaving}
                    className="button-primary"
                  >
                    {isSaving ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                    Confirm & Save
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="button-secondary"
                  >
                    Edit Details
                  </button>
                )}
              </div>
            </div>

            <div className="generation-details">
              <div
                className="generation-detail"
              >
                <Briefcase
                  size={16}
                  aria-hidden="true"
                />
                <div className="w-full">
                  <p className="generation-detail-label">
                    Position
                  </p>
                  {isEditing ? (
                    <input
                      type="text"
                      className="field"
                      aria-label="Position"
                      value={formData.position}
                      onChange={(e) =>
                        setFormData({ ...formData, position: e.target.value })
                      }
                    />
                  ) : (
                    <p className="generation-detail-value">
                      {result.position}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="generation-detail"
              >
                <Building2
                  size={16}
                  aria-hidden="true"
                />
                <div className="w-full">
                  <p className="generation-detail-label">
                    Company
                  </p>
                  {isEditing ? (
                    <input
                      type="text"
                      className="field"
                      aria-label="Company"
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                    />
                  ) : (
                    <p className="generation-detail-value">
                      {result.company}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="generation-detail"
              >
                <Hash size={16} aria-hidden="true" />
                <div className="w-full">
                  <p className="generation-detail-label">
                    Job ID
                  </p>
                  {isEditing ? (
                    <input
                      type="text"
                      className="field"
                      aria-label="Job ID"
                      value={formData.jobId}
                      onChange={(e) =>
                        setFormData({ ...formData, jobId: e.target.value })
                      }
                    />
                  ) : (
                    <p className="generation-detail-value">
                      {result.jobId || "—"}
                    </p>
                  )}
                </div>
              </div>

              <div
                className="generation-detail"
              >
                <MapPin
                  size={16}
                  aria-hidden="true"
                />
                <div className="w-full">
                  <p className="generation-detail-label">
                    Location
                  </p>
                  {isEditing ? (
                    <input
                      type="text"
                      className="field"
                      aria-label="Location"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData({ ...formData, location: e.target.value })
                      }
                    />
                  ) : (
                    <p className="generation-detail-value">
                      {result.location || "—"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="generation-documents">
            <div className="generation-document-toolbar">
              <div className="generation-document-tabs" role="tablist" aria-label="Generated documents">
                <button
                  onClick={() => setActiveTab("resume")}
                  className={`generation-document-tab ${
                    activeTab === "resume" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "resume"}
                >
                  <FileText size={16} />
                  Resume LaTeX
                </button>
                <button
                  onClick={() => setActiveTab("coverLetter")}
                  className={`generation-document-tab ${
                    activeTab === "coverLetter" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "coverLetter"}
                >
                  <Mail size={16} />
                  Cover Letter
                </button>
              </div>

              {activeTab === "coverLetter" ? (
                <DownloadDropdown
                  label="Download CL"
                  onDownloadPdf={() =>
                    downloadCoverLetterPdf(
                      result.applicationId,
                      formData.jobId || result.jobId,
                      formData.company || result.company,
                      userProfile?.fullName || "Candidate",
                    )
                  }
                  onDownloadDocx={() =>
                    downloadCoverLetterDocx(
                      result.applicationId,
                      formData.jobId || result.jobId,
                      formData.company || result.company,
                      userProfile?.fullName || "Candidate",
                    )
                  }
                />
              ) : (
                <DownloadDropdown
                  label="Download Resume"
                  onDownloadPdf={() =>
                    downloadResumePdf(
                      result.applicationId,
                      formData.jobId || result.jobId,
                      formData.company || result.company,
                      userProfile?.fullName || "Candidate",
                    )
                  }
                  onDownloadDocx={() =>
                    downloadResumeDocx(
                      result.applicationId,
                      formData.jobId || result.jobId,
                      formData.company || result.company,
                      userProfile?.fullName || "Candidate",
                    )
                  }
                />
              )}
            </div>

            {activeTab === "resume" ? (
              <div className="generation-resume-grid">
                <div className="generation-source surface">
                  <div className="generation-panel-header">
                    <span>
                      LaTeX Source
                    </span>
                    <button
                      onClick={() => handleCopy(result.latexContent)}
                      className="icon-button"
                      aria-label="Copy LaTeX source"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <textarea
                    className="generation-source-textarea"
                    aria-label="Generated LaTeX source"
                    value={result.latexContent}
                    onChange={(e) =>
                      setResult({ ...result, latexContent: e.target.value })
                    }
                  />
                </div>

                <div className="generation-preview surface">
                  <div className="generation-panel-header">
                    <span>
                      PDF Preview
                    </span>
                    {pdfError && (
                      <span className="flex items-center gap-1 text-xs text-danger">
                        <AlertTriangle size={12} /> Error
                      </span>
                    )}
                  </div>

                  <div className="generation-preview-body">
                    {pdfLoading && (
                      <div className="generation-preview-loading">
                        <Loader2
                          size={24}
                          className="animate-spin text-primary-600"
                        />
                        <span className="text-xs font-medium text-text-muted">
                          Compiling PDF…
                        </span>
                      </div>
                    )}

                    {pdfBlobUrl ? (
                      <iframe
                        src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-0"
                        title="Resume Preview"
                      />
                    ) : pdfError ? (
                      <div className="p-6 text-center text-text-muted">
                        <p className="text-sm">{pdfError}</p>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-text-muted">
                        <p className="text-sm">Preview not available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="generation-cover-letter surface">
                <div className="generation-panel-header">
                  <span>
                    Cover Letter
                  </span>
                  <button
                    onClick={() => handleCopy(result.coverLetterContent)}
                    className="icon-button"
                    aria-label="Copy cover letter"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <textarea
                  className="generation-cover-letter-textarea"
                  aria-label="Generated cover letter"
                  value={result.coverLetterContent}
                  onChange={(e) =>
                    setResult({ ...result, coverLetterContent: e.target.value })
                  }
                />
              </div>
            )}
          </motion.div>
        </>
      )}

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Edit & Preview"
        width="max-w-[95vw]"
      >
        {result && (
          <div className="generation-drawer">
            {/* Top Toolbar */}
            <div className="generation-drawer-toolbar">
              <div className="generation-document-tabs" role="tablist" aria-label="Editor document">
                <button
                  onClick={() => setActiveTab("resume")}
                  className={`generation-document-tab ${
                    activeTab === "resume" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "resume"}
                >
                  <FileText size={16} />
                  Resume LaTeX
                </button>
                <button
                  onClick={() => setActiveTab("coverLetter")}
                  className={`generation-document-tab ${
                    activeTab === "coverLetter" ? "active" : ""
                  }`}
                  role="tab"
                  aria-selected={activeTab === "coverLetter"}
                >
                  <Mail size={16} />
                  Cover Letter
                </button>
              </div>

              <div className="generation-drawer-actions">
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  className="button-secondary"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RotateCcw size={16} />
                  )}
                  Regenerate
                </button>
                <button
                  onClick={() => setShowPromptInput(!showPromptInput)}
                  className={`button-secondary ${showPromptInput ? "text-primary-600" : ""}`}
                >
                  <Sparkles size={16} />
                  Prompt
                </button>

                <button
                  onClick={handleUpdatePreview}
                  disabled={pdfLoading}
                  className="button-secondary"
                >
                  {pdfLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RotateCcw size={16} />
                  )}
                  Refresh PDF
                </button>

                {activeTab === "coverLetter" ? (
                  <DownloadDropdown
                    label="Download CL"
                    onDownloadPdf={() =>
                      downloadCoverLetterPdf(
                        result.applicationId,
                        formData.jobId || result.jobId,
                        formData.company || result.company,
                        userProfile?.fullName || "Candidate",
                      )
                    }
                    onDownloadDocx={() =>
                      downloadCoverLetterDocx(
                        result.applicationId,
                        formData.jobId || result.jobId,
                        formData.company || result.company,
                        userProfile?.fullName || "Candidate",
                      )
                    }
                  />
                ) : (
                  <DownloadDropdown
                    label="Download PDF"
                    onDownloadPdf={() =>
                      downloadResumePdf(
                        result.applicationId,
                        formData.jobId || result.jobId,
                        formData.company || result.company,
                        userProfile?.fullName || "Candidate",
                      )
                    }
                    onDownloadDocx={() =>
                      downloadResumeDocx(
                        result.applicationId,
                        formData.jobId || result.jobId,
                        formData.company || result.company,
                        userProfile?.fullName || "Candidate",
                      )
                    }
                  />
                )}
              </div>
            </div>

            {/* Custom Prompt Input */}
            <AnimatePresence>
              {showPromptInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="generation-prompt surface">
                    <textarea
                      className="field flex-1 resize-none"
                      rows={2}
                      placeholder="Enter custom instructions for regeneration…"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                    />
                    <button
                      onClick={handleRegenerate}
                      disabled={loading}
                      className="button-primary self-end"
                    >
                      Apply
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Regeneration Options */}
            {(showPromptInput || isDrawerOpen) && (
              <div className="generation-regeneration-option">
                <input
                  type="checkbox"
                  id="useIconResumeRegen"
                  checked={useIconResumeRegen}
                  onChange={(e) => setUseIconResumeRegen(e.target.checked)}
                  className="h-5 w-5 rounded-[3px] border-border-strong text-primary-600 focus:ring-primary-500"
                />
                <label
                  htmlFor="useIconResumeRegen"
                  className="cursor-pointer select-none text-sm text-text-secondary"
                >
                  Use{" "}
                  <span className="font-semibold text-text-primary">
                    Resume B (Icons)
                  </span>{" "}
                  during regeneration
                </label>
              </div>
            )}

            {/* Resizable Split View */}
            <div className="generation-split surface">
              <ResizableSplitView
                left={
                  <div className="generation-split-panel">
                    <div className="generation-panel-header">
                      <span>
                        {activeTab === "resume"
                          ? "LaTeX Source"
                          : "Markdown Content"}
                      </span>
                      <button
                        onClick={() =>
                          handleCopy(
                            activeTab === "resume"
                              ? result.latexContent
                              : result.coverLetterContent,
                          )
                        }
                        className="icon-button"
                        aria-label="Copy editor content"
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <textarea
                      className="generation-source-textarea"
                      aria-label="Document source"
                      value={
                        activeTab === "resume"
                          ? result.latexContent
                          : result.coverLetterContent
                      }
                      onChange={(e) =>
                        setResult({
                          ...result,
                          [activeTab === "resume"
                            ? "latexContent"
                            : "coverLetterContent"]: e.target.value,
                        })
                      }
                      spellCheck={false}
                    />
                  </div>
                }
                right={
                  <div className="generation-split-preview">
                    {pdfLoading && (
                      <div className="generation-preview-loading">
                        <Loader2
                          size={32}
                          className="animate-spin text-primary-600"
                        />
                        <span className="text-sm font-medium text-text-muted">
                          Compiling PDF…
                        </span>
                      </div>
                    )}
                    {pdfBlobUrl ? (
                      <iframe
                        src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-0"
                        title="Resume Preview"
                      />
                    ) : pdfError ? (
                      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-text-muted">
                        <AlertTriangle
                          size={32}
                          className="mb-2 text-danger"
                        />
                        <p className="text-sm text-danger">{pdfError}</p>
                      </div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center text-text-muted">
                        <p className="text-sm">Preview not available</p>
                      </div>
                    )}
                  </div>
                }
              />
            </div>
          </div>
        )}
      </Drawer>
    </motion.div>
  );
}
