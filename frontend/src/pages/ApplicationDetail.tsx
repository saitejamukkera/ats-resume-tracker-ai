import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Calendar,
  FileText,
  MapPin,
  Trash2,
  Download,
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
import { api } from "../lib/api";
import {
  type JobApplicationResponse,
  ApplicationStatus,
  type UserProfile,
} from "../types/dtos";
import { getFormattedFilename } from "../lib/utils";

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  // Editing state
  const [editingResume, setEditingResume] = useState(false);
  const [editingCoverLetter, setEditingCoverLetter] = useState(false);
  const [resumeDraft, setResumeDraft] = useState("");
  const [coverLetterDraft, setCoverLetterDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // PDF Preview state
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
      setPdfBlobUrl(URL.createObjectURL(blob));
    } catch {
      setPdfError("Failed to compile PDF preview.");
    } finally {
      setPdfLoading(false);
    }
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  useEffect(() => {
    if (!id) return;
    const fetchApp = async () => {
      try {
        const data = await api.applications.getById(Number(id));
        setApplication(data);
      } catch (err) {
        setError("Failed to load application details.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchApp();
    fetchApp();

    // Fetch profile for filename generation
    api.profile.get().then(setUserProfile).catch(console.error);
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm("Are you sure you want to delete this application?"))
      return;
    try {
      await api.applications.delete(Number(id));
      navigate("/");
    } catch (err) {
      alert("Failed to delete application. Please try again.");
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
      // refresh PDF preview if it was loaded
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
        alert("PDF compilation failed. The LaTeX may contain errors.");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const filename = getFormattedFilename(
        userProfile?.fullName || "Candidate",
        application.jobId,
        application.company,
        "Resume",
      );

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert(
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
        alert("PDF compilation failed.");
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const filename = getFormattedFilename(
        userProfile?.fullName || "Candidate",
        application.jobId,
        application.company,
        "Cover_Letter",
      );

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Failed to download PDF.");
    }
  };

  const getStatusConfig = (status: ApplicationStatus) => {
    switch (status) {
      case ApplicationStatus.ACTIVE:
        return {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
          label: "Active",
        };
      case ApplicationStatus.IN_PROCESS:
        return {
          bg: "bg-blue-50",
          text: "text-blue-700",
          border: "border-blue-200",
          label: "In Process",
        };
      case ApplicationStatus.REJECTED:
        return {
          bg: "bg-red-50",
          text: "text-red-700",
          border: "border-red-200",
          label: "Rejected",
        };
      case ApplicationStatus.OFFER_RECEIVED:
        return {
          bg: "bg-violet-50",
          text: "text-violet-700",
          border: "border-violet-200",
          label: "Offer Received",
        };
      default:
        return {
          bg: "bg-gray-50",
          text: "text-gray-700",
          border: "border-gray-200",
          label: status,
        };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-sm text-text-muted font-medium">
          Loading application...
        </p>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2 className="text-xl font-bold text-text-primary mb-2">
          Application Not Found
        </h2>
        <p className="text-text-muted mb-6">
          {error || "The requested application could not be found."}
        </p>
        <Link to="/" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-text-muted hover:text-primary-600 transition-colors text-sm font-medium"
      >
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      {/* Header Card */}
      <div className="card p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row justify-between lg:items-start gap-6">
          <div className="space-y-4 flex-1">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-text-primary">
                  {application.position}
                </h1>
                {(() => {
                  const status = getStatusConfig(application.outcome);
                  return (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${status.bg} ${status.text} ${status.border}`}
                    >
                      {status.label}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 text-lg text-text-secondary font-medium">
                <Building2 size={18} />
                {application.company}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-text-muted">
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
              <button onClick={handleDownloadPdf} className="btn btn-primary">
                <Download size={16} />
                Download PDF
              </button>
            )}
            <button
              onClick={handleDelete}
              className="btn bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Job Description */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-5 h-full flex flex-col">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Briefcase size={18} />
              Job Description
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 flex-1 border border-border overflow-y-auto max-h-[500px]">
              <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
                {application.jobDescription}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setActiveTab("resume")}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === "resume"
                      ? "bg-white text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <FileText size={14} />
                  Resume
                </button>
                <button
                  onClick={() => setActiveTab("coverLetter")}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === "coverLetter"
                      ? "bg-white text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <Mail size={14} />
                  Cover Letter
                  {application.hasCoverLetter && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
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
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === "pdfPreview"
                      ? "bg-white text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  <Eye size={14} />
                  PDF Preview
                </button>
              </div>
            </div>

            {/* Resume Tab Content */}
            {activeTab === "resume" && (
              <div className="flex-1 flex flex-col animate-fade-in">
                {application.hasGeneratedResume &&
                application.generatedResumeContent ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-text-secondary">
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
                              className="btn btn-ghost text-xs gap-1.5"
                            >
                              <X size={14} /> Cancel
                            </button>
                            <button
                              onClick={handleSaveResume}
                              disabled={saving}
                              className="btn btn-primary text-xs gap-1.5"
                            >
                              <Save size={14} /> {saving ? "Saving..." : "Save"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={startEditResume}
                              className="btn btn-ghost text-xs gap-1.5"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() =>
                                handleCopy(application.generatedResumeContent!)
                              }
                              className="btn btn-ghost text-xs gap-1.5"
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
                      className={`flex-1 w-full px-4 py-3 border rounded-xl font-mono text-xs resize-none transition-colors ${
                        editingResume
                          ? "bg-white border-primary-300 text-text-primary focus:ring-2 focus:ring-primary-200"
                          : "bg-gray-50 border-border text-text-secondary"
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
                  <div className="flex-1 bg-gray-50 rounded-xl border border-border flex items-center justify-center">
                    <div className="text-center p-8">
                      <FileText
                        size={48}
                        className="mx-auto text-gray-300 mb-4"
                      />
                      <p className="text-text-muted font-medium mb-2">
                        No Resume Generated
                      </p>
                      <p className="text-xs text-text-muted max-w-xs mx-auto">
                        Generate a resume from the New Application page.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cover Letter Tab Content */}
            {activeTab === "coverLetter" && (
              <div className="flex-1 flex flex-col animate-fade-in">
                {application.hasCoverLetter &&
                application.coverLetterContent ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-text-secondary">
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
                              className="btn btn-ghost text-xs gap-1.5"
                            >
                              <X size={14} /> Cancel
                            </button>
                            <button
                              onClick={handleSaveCoverLetter}
                              disabled={saving}
                              className="btn btn-primary text-xs gap-1.5"
                            >
                              <Save size={14} /> {saving ? "Saving..." : "Save"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={handleDownloadCoverLetterPdf}
                              className="btn btn-ghost text-xs gap-1.5"
                              title="Download PDF"
                            >
                              <Download size={14} /> PDF
                            </button>
                            <button
                              onClick={startEditCoverLetter}
                              className="btn btn-ghost text-xs gap-1.5"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() =>
                                handleCopy(application.coverLetterContent!)
                              }
                              className="btn btn-ghost text-xs gap-1.5"
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
                        className="flex-1 w-full px-4 py-3 bg-white border border-primary-300 rounded-xl text-sm text-text-primary font-sans leading-relaxed resize-none focus:ring-2 focus:ring-primary-200 transition-colors"
                        value={coverLetterDraft}
                        onChange={(e) => setCoverLetterDraft(e.target.value)}
                      />
                    ) : (
                      <div className="flex-1 bg-white border border-border rounded-xl p-6 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm text-text-primary font-sans leading-relaxed">
                          {application.coverLetterContent}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 bg-gray-50 rounded-xl border border-border flex items-center justify-center">
                    <div className="text-center p-8">
                      <Mail size={48} className="mx-auto text-gray-300 mb-4" />
                      <p className="text-text-muted font-medium mb-2">
                        No Cover Letter Generated
                      </p>
                      <p className="text-xs text-text-muted max-w-xs mx-auto">
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
              <div className="flex-1 flex flex-col animate-fade-in">
                {application.hasGeneratedResume ? (
                  <div
                    className="flex-1 rounded-xl border border-border overflow-hidden bg-gray-100"
                    style={{ minHeight: "600px" }}
                  >
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
                          onClick={() => compilePdfPreview(application.id)}
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
                        style={{ minHeight: "600px" }}
                      />
                    )}
                    {!pdfBlobUrl && !pdfLoading && !pdfError && (
                      <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
                        <Eye size={32} className="text-gray-300" />
                        <p className="text-sm text-text-muted">
                          Click to load PDF preview
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 bg-gray-50 rounded-xl border border-border flex items-center justify-center">
                    <div className="text-center p-8">
                      <FileText
                        size={48}
                        className="mx-auto text-gray-300 mb-4"
                      />
                      <p className="text-text-muted font-medium mb-2">
                        No Resume Generated
                      </p>
                      <p className="text-xs text-text-muted max-w-xs mx-auto">
                        Generate a resume from the New Application page.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
