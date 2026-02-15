"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  Loader2,
  Sparkles,
  RotateCcw,
  Settings,
  Mail,
  Check,
  MapPin,
  Building2,
  Hash,
  Briefcase,
  AlertTriangle,
  Copy,
  ArrowRight,
} from "lucide-react";
import { api, type GenerateFromJdResponse } from "../../lib/api";
import { getFormattedFilename } from "../../lib/utils";
import type { UserProfile } from "../../types/dtos";
import { useToast } from "../../context/ToastContext";

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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasBaseResumes, setHasBaseResumes] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const toast = useToast();

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
  }, [mounted]);

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

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      toast.warning("Please paste a job description.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.resumes.generateFromJd(
        jobDescription,
        useIconResume,
      );
      setResult(response);
      setFormData({
        position: response.position,
        company: response.company,
        jobId: response.jobId,
        location: response.location,
      });
      setGenerated(true);
      setIsEditing(true);
      compilePdfPreview(response.applicationId);
    } catch (error) {
      console.error(error);
      toast.error(
        "Failed to generate. Ensure base resumes are uploaded in Settings and the backend is running.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!result) return;
    setLoading(true);
    try {
      const response = await api.resumes.generate(result.applicationId, {
        jobDescription,
        customPrompt: customPrompt.trim() || undefined,
      });
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
    setLoading(true);
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
      setLoading(false);
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center p-12 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-800/60 shadow-xl ring-1 ring-gray-900/5 dark:ring-white/5"
        >
          <div className="relative mb-8">
            <div className="w-16 h-16 rounded-full border-4 border-primary-100 dark:border-primary-900 border-t-primary-600 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={20} className="text-primary-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold tracking-tight mb-3">
            <span className="bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              Analyzing Job Description...
            </span>
          </h2>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-medium animate-pulse text-center max-w-sm leading-relaxed">
            Extracting job details, rewriting your resume, and drafting a cover
            letter...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!generated) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="max-w-3xl mx-auto"
      >
        <motion.div variants={fadeInUp}>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 mb-6 transition-colors text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
        </motion.div>

        <motion.div variants={fadeInUp} className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              New Application
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            Paste the Job Description below. Gemini will automatically extract
            job details and tailor your resume.
          </p>
        </motion.div>

        {hasBaseResumes === false && (
          <motion.div
            variants={fadeInUp}
            className="flex items-center gap-3 px-5 py-4 rounded-2xl mb-6 bg-amber-50/80 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-800/60 backdrop-blur-sm"
          >
            <Sparkles size={20} className="text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
              You haven&apos;t set up your base resumes yet. Please go to
              Settings first.
            </p>
            <Link
              href="/settings"
              className="ml-auto shrink-0 text-sm font-semibold text-amber-800 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 px-4 py-2 rounded-full transition-colors"
            >
              <Settings size={14} className="inline mr-1" />
              Settings
            </Link>
          </motion.div>
        )}

        <motion.div
          variants={fadeInUp}
          className="p-8 space-y-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-gray-900 dark:text-white">
                Job Description (JD)
              </label>
              <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800">
                Paste full text
              </span>
            </div>
            <textarea
              className="w-full h-72 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
              placeholder="Paste the complete job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 dark:bg-zinc-800/50 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
            <input
              type="checkbox"
              id="useIconResume"
              checked={useIconResume}
              onChange={(e) => setUseIconResume(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <label
              htmlFor="useIconResume"
              className="text-sm cursor-pointer select-none text-gray-700 dark:text-gray-300"
            >
              Use{" "}
              <span className="font-bold text-gray-900 dark:text-white">
                Base Resume B (With Icons)
              </span>
              ?{" "}
              <span className="text-gray-400 dark:text-gray-500">
                (Default is A - No Icons)
              </span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={
                loading || !jobDescription.trim() || hasBaseResumes === false
              }
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-base font-semibold shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Analyzing & Generating...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Analyze & Generate
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="max-w-5xl mx-auto"
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
          className="inline-flex items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 mb-6 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} />
          New Generation
        </button>
      </motion.div>

      {result && (
        <motion.div
          variants={fadeInUp}
          className="p-6 mb-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isEditing
                  ? "bg-amber-50 dark:bg-amber-900/20"
                  : "bg-emerald-50 dark:bg-emerald-900/20"
              }`}
            >
              <CheckCircle
                size={20}
                className={isEditing ? "text-amber-500" : "text-emerald-500"}
              />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                {isEditing
                  ? "Review & Confirm Details"
                  : "Application Confirmed"}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {isEditing
                  ? "Please verify the extracted information before saving."
                  : "Application details have been saved successfully."}
              </p>
            </div>
            {isEditing ? (
              <button
                onClick={handleSaveApp}
                disabled={loading}
                className="ml-auto inline-flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <CheckCircle size={16} />
                )}
                Confirm & Save
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="ml-auto px-4 py-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full text-sm font-medium transition-colors"
              >
                Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white dark:bg-zinc-900 border border-primary-200 dark:border-primary-800 ring-2 ring-primary-50 dark:ring-primary-900/20" : "bg-gray-50/80 dark:bg-zinc-800/50"}`}
            >
              <Briefcase
                size={16}
                className="text-primary-500 mt-2.5 shrink-0"
              />
              <div className="w-full">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                  Position
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-primary-500 focus:outline-none px-1 py-0.5"
                    value={formData.position}
                    onChange={(e) =>
                      setFormData({ ...formData, position: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                    {result.position}
                  </p>
                )}
              </div>
            </div>

            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 ring-2 ring-blue-50 dark:ring-blue-900/20" : "bg-gray-50/80 dark:bg-zinc-800/50"}`}
            >
              <Building2 size={16} className="text-blue-500 mt-2.5 shrink-0" />
              <div className="w-full">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                  Company
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                    {result.company}
                  </p>
                )}
              </div>
            </div>

            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white dark:bg-zinc-900 border border-teal-200 dark:border-teal-800 ring-2 ring-teal-50 dark:ring-teal-900/20" : "bg-gray-50/80 dark:bg-zinc-800/50"}`}
            >
              <Hash size={16} className="text-teal-500 mt-2.5 shrink-0" />
              <div className="w-full">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                  Job ID
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-teal-500 focus:outline-none px-1 py-0.5"
                    value={formData.jobId}
                    onChange={(e) =>
                      setFormData({ ...formData, jobId: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                    {result.jobId || "—"}
                  </p>
                )}
              </div>
            </div>

            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 ring-2 ring-emerald-50 dark:ring-emerald-900/20" : "bg-gray-50/80 dark:bg-zinc-800/50"}`}
            >
              <MapPin size={16} className="text-emerald-500 mt-2.5 shrink-0" />
              <div className="w-full">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                  Location
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:outline-none px-1 py-0.5"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                    {result.location || "—"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {result && (
        <motion.div
          variants={fadeInUp}
          className="p-6 space-y-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={async () => {
                  try {
                    const blob = await api.resumes.downloadPdf(
                      result.applicationId,
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = getFormattedFilename(
                      userProfile?.fullName || "Candidate",
                      formData.jobId || result.jobId,
                      formData.company || result.company,
                      "Resume",
                      "pdf",
                    );
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error("PDF download failed", error);
                    toast.error("Failed to download PDF.");
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
              >
                <FileText size={16} />
                Download PDF
              </button>
              <button
                onClick={handleRegenerate}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full text-sm font-medium transition-colors"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                Regenerate
              </button>
              <button
                onClick={() => setShowPromptInput(!showPromptInput)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                  showPromptInput
                    ? "text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-primary-900/20"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
                }`}
                title="Add custom instructions for regeneration"
              >
                <Sparkles size={14} />
                Prompt
              </button>
            </div>
            <button
              onClick={() => {
                router.push("/");
                clearStorage();
              }}
              className="inline-flex items-center gap-2 px-5 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full text-sm font-medium transition-colors"
            >
              <CheckCircle size={14} />
              Done
            </button>
          </div>

          {showPromptInput && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary-50/50 dark:bg-primary-900/10 border border-primary-200/60 dark:border-primary-800/60 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  size={14}
                  className="text-primary-600 dark:text-primary-400"
                />
                <label className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wider">
                  Custom Instructions
                </label>
              </div>
              <textarea
                className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-primary-200/60 dark:border-primary-700/60 rounded-xl text-sm text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors"
                rows={3}
                placeholder="e.g. Focus more on leadership experience, add more Python projects, emphasize cloud skills..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  These instructions will be added to the regeneration prompt.
                  Leave empty to regenerate normally.
                </p>
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold transition-all shadow-sm hover:-translate-y-0.5"
                >
                  {loading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                  {customPrompt.trim()
                    ? "Regenerate with Prompt"
                    : "Regenerate"}
                </button>
              </div>
            </motion.div>
          )}

          <div className="flex gap-1 p-1 bg-gray-100/80 dark:bg-zinc-800/80 rounded-full">
            <button
              onClick={() => setActiveTab("resume")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-sm font-semibold transition-all ${
                activeTab === "resume"
                  ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <FileText size={16} />
              Resume LaTeX
            </button>
            <button
              onClick={() => setActiveTab("coverLetter")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-sm font-semibold transition-all ${
                activeTab === "coverLetter"
                  ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <Mail size={16} />
              Cover Letter
            </button>
          </div>

          {activeTab === "resume" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-150">
              <div className="flex flex-col h-full rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-gray-50/80 dark:bg-zinc-800/50 ring-1 ring-gray-900/5 dark:ring-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200/60 dark:border-gray-800/60">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    LaTeX Source
                  </span>
                  <button
                    onClick={() => handleCopy(result.latexContent)}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full text-gray-400 dark:text-gray-500 transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <textarea
                  className="flex-1 w-full p-4 bg-transparent resize-none focus:outline-none font-mono text-sm text-gray-900 dark:text-white leading-relaxed"
                  value={result.latexContent}
                  onChange={(e) =>
                    setResult({ ...result, latexContent: e.target.value })
                  }
                />
              </div>

              <div className="h-full rounded-2xl border border-gray-200/60 dark:border-gray-800/60 overflow-hidden bg-gray-100 dark:bg-zinc-800 flex flex-col ring-1 ring-gray-900/5 dark:ring-white/5">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    PDF Preview
                  </span>
                  {pdfError && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle size={12} /> Error
                    </span>
                  )}
                </div>

                <div className="flex-1 relative bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                  {pdfLoading && (
                    <div className="absolute inset-0 z-10 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                      <Loader2
                        size={24}
                        className="animate-spin text-primary-600"
                      />
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                        Compiling PDF...
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
                    <div className="text-center p-6 text-gray-400 dark:text-gray-500">
                      <p className="text-sm">{pdfError}</p>
                    </div>
                  ) : (
                    <div className="text-center p-6 text-gray-400 dark:text-gray-600">
                      <p className="text-sm">Preview not available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-150 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm ring-1 ring-gray-900/5 dark:ring-white/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200/60 dark:border-gray-800/60">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Cover Letter
                </span>
                <button
                  onClick={() => handleCopy(result.coverLetterContent)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-gray-400 dark:text-gray-500 transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <textarea
                className="flex-1 w-full p-6 resize-none focus:outline-none font-sans text-sm text-gray-900 dark:text-white leading-relaxed bg-transparent"
                value={result.coverLetterContent}
                onChange={(e) =>
                  setResult({ ...result, coverLetterContent: e.target.value })
                }
              />
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
