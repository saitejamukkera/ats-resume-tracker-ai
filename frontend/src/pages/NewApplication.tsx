import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  Loader2,
  Sparkles,
  Download,
  RotateCcw,
  Settings,
  Mail,
  Copy,
  Check,
  MapPin,
  Building2,
  Hash,
  Briefcase,
  Eye,
  Code,
  AlertTriangle,
} from "lucide-react";
import { api } from "../lib/api";
import type { GenerateFromJdResponse } from "../lib/api";
import { getFormattedFilename } from "../lib/utils";
import type { UserProfile } from "../types/dtos";

export default function NewApplication() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [hasBaseResumes, setHasBaseResumes] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Load saved state from local storage
  const [generated, setGenerated] = useState(() => {
    const saved = localStorage.getItem("newApp_generated");
    return saved ? JSON.parse(saved) : false;
  });
  const [isEditing, setIsEditing] = useState(() => {
    const saved = localStorage.getItem("newApp_isEditing");
    return saved ? JSON.parse(saved) : false;
  });
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem("newApp_formData");
    return saved
      ? JSON.parse(saved)
      : {
          position: "",
          company: "",
          jobId: "",
          location: "",
        };
  });

  // Input State
  const [jobDescription, setJobDescription] = useState(() => {
    return localStorage.getItem("newApp_jobDescription") || "";
  });
  const [useIconResume, setUseIconResume] = useState(() => {
    const saved = localStorage.getItem("newApp_useIconResume");
    return saved ? JSON.parse(saved) : false;
  });

  // Result State
  const [result, setResult] = useState<GenerateFromJdResponse | null>(() => {
    const saved = localStorage.getItem("newApp_result");
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState<"resume" | "coverLetter">(
    "resume",
  );
  const [copied, setCopied] = useState(false);

  // PDF Preview State
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [resumeView, setResumeView] = useState<"split" | "latex" | "pdf">(
    "split",
  );

  // Split View State
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleDrag = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; // x position within the element.
        const newRatio = x / rect.width;
        // Clamp between 20% and 80%
        if (newRatio > 0.2 && newRatio < 0.8) {
          setSplitRatio(newRatio);
        }
      }
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleDrag);
    window.addEventListener("mouseup", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleDrag);
      window.removeEventListener("mouseup", handleDragEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  // Compile PDF preview in background
  const compilePdfPreview = useCallback(async (applicationId: number) => {
    setPdfLoading(true);
    setPdfError(null);
    // Revoke old URL
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

  // Cleanup hook to revoke blob URL when component unmounts
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Persist form state to local storage
  useEffect(() => {
    localStorage.setItem("newApp_generated", JSON.stringify(generated));
    localStorage.setItem("newApp_isEditing", JSON.stringify(isEditing));
    localStorage.setItem("newApp_formData", JSON.stringify(formData));
    localStorage.setItem("newApp_jobDescription", jobDescription);
    localStorage.setItem("newApp_useIconResume", JSON.stringify(useIconResume));
    localStorage.setItem("newApp_result", JSON.stringify(result));
  }, [generated, isEditing, formData, jobDescription, useIconResume, result]);

  const clearStorage = () => {
    localStorage.removeItem("newApp_generated");
    localStorage.removeItem("newApp_isEditing");
    localStorage.removeItem("newApp_formData");
    localStorage.removeItem("newApp_jobDescription");
    localStorage.removeItem("newApp_useIconResume");
    localStorage.removeItem("newApp_result");
  };

  // Verify base resume availability on mount
  useEffect(() => {
    const checkBaseResumes = async () => {
      try {
        const count = await api.resumes.getBaseResumeCount();
        setHasBaseResumes(count > 0);
      } catch {
        setHasBaseResumes(null);
      }
    };
    checkBaseResumes();

    // Fetch profile
    api.profile.get().then(setUserProfile).catch(console.error);

    // If we have a result from storage, restore PDF preview
    if (result?.applicationId) {
      compilePdfPreview(result.applicationId);
    }
  }, []);

  // Debounced auto-compilation of PDF when LaTeX content changes
  useEffect(() => {
    if (!result?.latexContent) return;

    // Skip the very first render or if we just generated/loaded
    // We can't easily distinguish "just generated" from "user typed" without refs,
    // but a 2s debounce makes the redundant call minimal impact.
    // However, to avoid double-compile on load, we can check if it's editing.
    // We'll just rely on the debounce to handle the "user stopped typing" case.

    const timeoutId = setTimeout(() => {
      // Only auto-update if we have a valid result and it's not currently loading
      // We check result again inside the timeout closure
      if (result && !pdfLoading) {
        handleUpdatePreview();
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [result?.latexContent]);

  const handleGenerate = async () => {
    if (!jobDescription.trim()) {
      alert("Please paste a job description.");
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
      setIsEditing(true); // Default to editing mode (Step 2)
      // Auto-compile PDF preview in background
      compilePdfPreview(response.applicationId);
    } catch (error) {
      console.error(error);
      alert(
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
      // Re-compile PDF preview after regeneration
      if (result) compilePdfPreview(result.applicationId);
    } catch (error) {
      console.error(error);
      alert("Failed to regenerate.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApp = async () => {
    if (!result) return;
    setLoading(true);
    try {
      // First save any pending content changes
      await api.resumes.updateContent(
        result.applicationId,
        result.latexContent,
        result.coverLetterContent,
      );

      await api.applications.update(result.applicationId, {
        ...formData,
        jobDescription: jobDescription, // Use current JD
        outcome: "ACTIVE", // Mark as active so it shows in dashboard
      });
      // Update result state with new values
      setResult({
        ...result,
        ...formData,
        outcome: "ACTIVE",
      });
      setIsEditing(false); // Switch to View Mode (Step 3)
      clearStorage(); // Clear storage after successful save
    } catch (error) {
      console.error(error);
      alert("Failed to save application.");
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
      alert("Failed to update preview.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Loading view
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in flex flex-col justify-center min-h-[60vh]">
        <div className="flex flex-col items-center justify-center p-12 bg-white/80 backdrop-blur-sm rounded-2xl border border-indigo-100 shadow-xl">
          <div className="relative mb-8">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={20} className="text-indigo-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3 tracking-tight">
            Analyzing Job Description...
          </h2>
          <p className="text-gray-500 text-sm font-medium animate-pulse text-center max-w-sm leading-relaxed">
            Extracting job details, rewriting your resume, and drafting a cover
            letter...
          </p>
        </div>
      </div>
    );
  }

  // Input view
  if (!generated) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-text-muted hover:text-primary-600 mb-6 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
            New Application
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Paste the Job Description below. Gemini will automatically extract
            job details and tailor your resume.
          </p>
        </div>

        {/* No Base Resume Warning */}
        {hasBaseResumes === false && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl mb-6 bg-amber-50 border border-amber-200 animate-fade-in">
            <Sparkles size={20} className="text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              You haven't set up your base resumes yet. Please go to Settings
              first.
            </p>
            <Link
              to="/settings"
              className="ml-auto shrink-0 text-sm font-semibold text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Settings size={14} className="inline mr-1" />
              Settings
            </Link>
          </div>
        )}

        <div className="card p-8 space-y-6">
          {/* JD Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-text-primary">
                Job Description (JD)
              </label>
              <span className="text-xs text-text-muted">Paste full text</span>
            </div>
            <textarea
              className="w-full h-72 px-4 py-3 rounded-xl border border-border bg-white text-sm placeholder:text-text-muted resize-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-all"
              placeholder="Paste the complete job description here..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          {/* Icon Resume Checkbox */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-border">
            <input
              type="checkbox"
              id="useIconResume"
              checked={useIconResume}
              onChange={(e) => setUseIconResume(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <label
              htmlFor="useIconResume"
              className="text-sm cursor-pointer select-none"
            >
              Use{" "}
              <span className="font-bold text-text-primary">
                Base Resume B (With Icons)
              </span>
              ?{" "}
              <span className="text-text-muted">(Default is A - No Icons)</span>
            </label>
          </div>

          {/* Generate Button */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={
                loading || !jobDescription.trim() || hasBaseResumes === false
              }
              className="btn btn-primary px-8 py-3 text-base"
              style={{
                background:
                  loading || !jobDescription.trim()
                    ? undefined
                    : "linear-gradient(135deg, #4338ca, #6366f1)",
                boxShadow:
                  loading || !jobDescription.trim()
                    ? undefined
                    : "0 4px 20px rgba(99, 102, 241, 0.35)",
              }}
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
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results view
  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
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
        className="inline-flex items-center gap-2 text-text-muted hover:text-primary-600 mb-6 transition-colors text-sm font-medium"
      >
        <ArrowLeft size={16} />
        New Generation
      </button>

      {/* Extracted Fields */}
      {result && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isEditing ? "bg-amber-50" : "bg-emerald-50"
              }`}
            >
              <CheckCircle
                size={20}
                className={isEditing ? "text-amber-500" : "text-emerald-500"}
              />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                {isEditing
                  ? "Review & Confirm Details"
                  : "Application Confirmed"}
              </h2>
              <p className="text-xs text-text-muted">
                {isEditing
                  ? "Please verify the extracted information before saving."
                  : "Application details have been saved successfully."}
              </p>
            </div>
            {isEditing && (
              <button
                onClick={handleSaveApp}
                disabled={loading}
                className="ml-auto btn btn-primary flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <CheckCircle size={16} />
                )}
                Confirm & Save
              </button>
            )}
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="ml-auto btn btn-ghost text-primary-600 font-medium text-sm"
              >
                Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Position Field */}
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white border border-primary-200 ring-2 ring-primary-50" : "bg-gray-50"}`}
            >
              <Briefcase
                size={16}
                className="text-primary-500 mt-2.5 shrink-0"
              />
              <div className="w-full">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                  Position
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-text-primary bg-transparent border-b border-gray-200 focus:border-primary-500 focus:outline-none px-1 py-0.5"
                    value={formData.position}
                    onChange={(e) =>
                      setFormData({ ...formData, position: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {result.position}
                  </p>
                )}
              </div>
            </div>

            {/* Company Field */}
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white border border-blue-200 ring-2 ring-blue-50" : "bg-gray-50"}`}
            >
              <Building2 size={16} className="text-blue-500 mt-2.5 shrink-0" />
              <div className="w-full">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                  Company
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-text-primary bg-transparent border-b border-gray-200 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {result.company}
                  </p>
                )}
              </div>
            </div>

            {/* Job ID Field */}
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white border border-teal-200 ring-2 ring-teal-50" : "bg-gray-50"}`}
            >
              <Hash size={16} className="text-teal-500 mt-2.5 shrink-0" />
              <div className="w-full">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                  Job ID
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-text-primary bg-transparent border-b border-gray-200 focus:border-teal-500 focus:outline-none px-1 py-0.5"
                    value={formData.jobId}
                    onChange={(e) =>
                      setFormData({ ...formData, jobId: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {result.jobId || "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Location Field */}
            <div
              className={`flex items-start gap-2.5 p-3 rounded-xl ${isEditing ? "bg-white border border-emerald-200 ring-2 ring-emerald-50" : "bg-gray-50"}`}
            >
              <MapPin size={16} className="text-emerald-500 mt-2.5 shrink-0" />
              <div className="w-full">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                  Location
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-text-primary bg-transparent border-b border-gray-200 focus:border-emerald-500 focus:outline-none px-1 py-0.5"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-sm font-semibold text-text-primary mt-0.5">
                    {result.location || "—"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generated Content */}
      {result && (
        <div className="card p-6 space-y-6">
          {/* Download + Regen bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  btn.disabled = true;
                  try {
                    const blob = await api.resumes.downloadPdf(
                      result.applicationId,
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;

                    const filename = getFormattedFilename(
                      userProfile?.fullName || "Candidate",
                      formData.jobId || result.jobId,
                      formData.company || result.company,
                      "Resume",
                    );

                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error("PDF download failed", error);
                    alert(
                      "Failed to download PDF. The LaTeX may have compilation errors.",
                    );
                  } finally {
                    btn.disabled = false;
                  }
                }}
                className="btn btn-primary"
              >
                <Download size={16} />
                Download PDF
              </button>
              <button
                onClick={handleRegenerate}
                disabled={loading}
                className="btn btn-ghost text-primary-600"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                Regenerate
              </button>
            </div>
            <button
              onClick={() => {
                navigate("/");
                clearStorage();
              }}
              className="btn btn-secondary"
            >
              <CheckCircle size={14} />
              Done
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setActiveTab("resume")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "resume"
                  ? "bg-white text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <FileText size={16} />
              Resume LaTeX
            </button>
            <button
              onClick={() => setActiveTab("coverLetter")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "coverLetter"
                  ? "bg-white text-text-primary shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <Mail size={16} />
              Cover Letter
              {result.coverLetterContent && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "resume" && (
            <div className="space-y-3 animate-fade-in">
              {/* View Mode Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => setResumeView("split")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      resumeView === "split"
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <Eye size={12} />
                    Split View
                  </button>
                  <button
                    onClick={() => setResumeView("latex")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      resumeView === "latex"
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <Code size={12} />
                    LaTeX Only
                  </button>
                  <button
                    onClick={() => setResumeView("pdf")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      resumeView === "pdf"
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <FileText size={12} />
                    PDF Only
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdatePreview}
                    disabled={pdfLoading}
                    className="btn btn-primary text-xs gap-1.5 py-1.5 h-auto"
                  >
                    {pdfLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RotateCcw size={12} />
                    )}
                    Update Preview
                  </button>
                  <button
                    onClick={() => handleCopy(result.latexContent)}
                    className="btn btn-ghost text-xs gap-1.5"
                  >
                    {copied ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Split / LaTeX / PDF View */}
              <div
                ref={containerRef}
                className={`flex ${resumeView === "split" ? "" : ""}`}
                style={{ minHeight: "600px" }} // Increased height for better visibility
              >
                {/* LaTeX Panel */}
                {(resumeView === "split" || resumeView === "latex") && (
                  <div
                    className="flex flex-col relative"
                    style={{
                      width:
                        resumeView === "split"
                          ? `${splitRatio * 100}%`
                          : "100%",
                      paddingRight: resumeView === "split" ? "8px" : "0", // Gap for handle
                    }}
                  >
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex justify-between select-none">
                      <span>LaTeX Source</span>
                      <span className="text-[10px] font-normal text-text-muted normal-case bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                        Editable
                      </span>
                    </label>
                    <textarea
                      className="flex-1 w-full px-4 py-3 bg-white border border-border rounded-xl font-mono text-xs text-text-primary resize-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition-colors shadow-sm"
                      value={result.latexContent}
                      onChange={(e) =>
                        setResult({ ...result, latexContent: e.target.value })
                      }
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* Drag Handle */}
                {resumeView === "split" && (
                  <div
                    className="w-4 -ml-2 z-20 cursor-col-resize flex items-center justify-center hover:bg-primary-50/50 transition-colors group select-none relative"
                    onMouseDown={handleDragStart}
                  >
                    {/* Visible Line */}
                    <div
                      className={`w-1 h-8 rounded-full transition-colors ${isDragging ? "bg-primary-500 shadow-md scale-y-125" : "bg-gray-200 group-hover:bg-primary-300"}`}
                    />

                    {/* Invisible wider hit area */}
                    <div className="absolute inset-y-0 -left-2 -right-2 z-10" />
                  </div>
                )}

                {/* PDF Preview Panel */}
                {(resumeView === "split" || resumeView === "pdf") && (
                  <div
                    className="flex flex-col relative"
                    style={{
                      width:
                        resumeView === "split"
                          ? `${(1 - splitRatio) * 100}%`
                          : "100%",
                      paddingLeft: resumeView === "split" ? "8px" : "0", // Gap for handle
                    }}
                  >
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 select-none">
                      PDF Preview
                    </label>
                    <div className="flex-1 rounded-xl border border-border overflow-hidden bg-gray-100 shadow-sm relative">
                      {/* Overlay to catch mouse events over iframe during drag */}
                      {isDragging && (
                        <div className="absolute inset-0 z-50 bg-transparent" />
                      )}

                      {pdfLoading && (
                        <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                          <div className="w-10 h-10 rounded-full border-3 border-primary-200 border-t-primary-600 animate-spin" />
                          <p className="text-sm text-text-muted font-medium animate-pulse">
                            Compiling PDF...
                          </p>
                        </div>
                      )}
                      {pdfError && (
                        <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                          <AlertTriangle size={32} className="text-amber-400" />
                          <p className="text-sm text-text-muted text-center max-w-xs">
                            {pdfError}
                          </p>
                          <button
                            onClick={() =>
                              compilePdfPreview(result.applicationId)
                            }
                            className="btn btn-ghost text-sm text-primary-600"
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
                          style={{ minHeight: "500px" }}
                        />
                      )}
                      {!pdfBlobUrl && !pdfLoading && !pdfError && (
                        <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                          <FileText size={32} className="text-gray-300" />
                          <p className="text-sm text-text-muted">
                            PDF preview will appear here
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "coverLetter" && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-text-secondary">
                  Generated Cover Letter
                </label>
                {result.coverLetterContent && (
                  <button
                    onClick={() => handleCopy(result.coverLetterContent)}
                    className="btn btn-ghost text-xs gap-1.5"
                  >
                    {copied ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                )}
              </div>
              {result.coverLetterContent ? (
                <div className="bg-white border border-border rounded-xl p-6">
                  <pre className="whitespace-pre-wrap text-sm text-text-primary font-sans leading-relaxed">
                    {result.coverLetterContent}
                  </pre>
                </div>
              ) : (
                <div className="bg-gray-50 border border-border rounded-xl p-8 text-center">
                  <Mail size={32} className="mx-auto text-text-muted mb-3" />
                  <p className="text-sm text-text-muted">
                    No cover letter was generated. Set up your profile in
                    Settings to enable personalized cover letters.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
