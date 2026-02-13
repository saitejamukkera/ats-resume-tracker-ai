import { useState, useEffect } from "react";
import {
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  User,
  GraduationCap,
  FileText,
  Sparkles,
  Info,
} from "lucide-react";
import { api } from "../lib/api";
import type { UserProfile } from "../types/dtos";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function SettingsPage() {
  // Profile state
  const [profile, setProfile] = useState<UserProfile>({
    fullName: "",
    address: "",
    phone: "",
    email: "",
    linkedinUrl: "",
    portfolioUrl: "",
    githubUrl: "",
    masterSubjects: "",
    mastersDegree: "",
    mastersGpa: "",
  });

  // Resume state
  const [resumeAContent, setResumeAContent] = useState("");
  const [resumeBContent, setResumeBContent] = useState("");
  const [activeResumeTab, setActiveResumeTab] = useState<"A" | "B">("A");

  // UI state
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  // Load on mount
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.profile.get();
        if (data) setProfile(data);
      } catch {
        /* not set yet */
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/resumes/base`);
        if (response.ok) {
          const resumes = await response.json();
          for (const r of resumes) {
            if (r.name === "Base Resume A") setResumeAContent(r.content || "");
            if (r.name === "Base Resume B") setResumeBContent(r.content || "");
          }
        }
      } catch {
        /* backend down */
      }
    };
    load();
  }, []);

  const handleSaveAll = async () => {
    if (!resumeAContent.trim()) {
      setMessage("Base Resume A (No Icons) is required.");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // Save profile
      await api.profile.save(profile);

      // Save Resume A
      await fetch(`${API_BASE_URL}/api/resumes/base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Base Resume A",
          content: resumeAContent,
          hasIcons: false,
        }),
      });

      // Save Resume B (only if provided)
      if (resumeBContent.trim()) {
        await fetch(`${API_BASE_URL}/api/resumes/base`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Base Resume B",
            content: resumeBContent,
            hasIcons: true,
          }),
        });
      }

      setMessage("All configurations saved successfully!");
      setMessageType("success");
    } catch {
      setMessage("Failed to save. Is the backend running?");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Configure your profile and resume templates
        </p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium animate-fade-in ${
            messageType === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {messageType === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {message}
        </div>
      )}

      {/* Profile Section */}
      <div className="card card-accent-violet p-8">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-border">
          <div className="w-11 h-11 rounded-xl bg-linear-to-br from-primary-100 to-primary-50 flex items-center justify-center">
            <User size={22} className="text-primary-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">
              Personal Information
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              Used for generating cover letters with your details
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                label: "Full Name",
                field: "fullName" as const,
                placeholder: "Sai Teja Mukkera",
                type: "text",
              },
              {
                label: "Address",
                field: "address" as const,
                placeholder: "Warrensburg, MO",
                type: "text",
              },
              {
                label: "Phone",
                field: "phone" as const,
                placeholder: "(913) 963-9317",
                type: "text",
              },
              {
                label: "Email",
                field: "email" as const,
                placeholder: "saitejamukkera@gmail.com",
                type: "email",
              },
              {
                label: "LinkedIn URL",
                field: "linkedinUrl" as const,
                placeholder: "https://linkedin.com/in/...",
                type: "url",
              },
              {
                label: "Portfolio URL",
                field: "portfolioUrl" as const,
                placeholder: "https://yourportfolio.com",
                type: "url",
                optional: true,
              },
              {
                label: "GitHub URL",
                field: "githubUrl" as const,
                placeholder: "https://github.com/...",
                type: "url",
                optional: true,
              },
            ].map((item) => (
              <div key={item.field} className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  {item.label}{" "}
                  {item.optional && (
                    <span className="text-text-muted font-normal">
                      (Optional)
                    </span>
                  )}
                </label>
                <input
                  type={item.type}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-[13px] placeholder:text-text-muted transition-all"
                  placeholder={item.placeholder}
                  value={profile[item.field] || ""}
                  onChange={(e) => updateProfile(item.field, e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Master's Section */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-linear-to-br from-violet-100 to-violet-50 flex items-center justify-center">
                <GraduationCap size={18} className="text-violet-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">
                  Master's Education{" "}
                  <span className="text-text-muted font-normal">
                    (Optional)
                  </span>
                </h3>
                <p className="text-xs text-text-muted">
                  Relevant subjects will be used to strengthen your cover
                  letters
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Degree
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-sm placeholder:text-text-muted"
                  placeholder="Master of Science in Computer Science"
                  value={profile.mastersDegree}
                  onChange={(e) =>
                    updateProfile("mastersDegree", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  GPA
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-sm placeholder:text-text-muted"
                  placeholder="4.0"
                  value={profile.mastersGpa}
                  onChange={(e) => updateProfile("mastersGpa", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-text-secondary">
                Subjects Taken
              </label>
              <textarea
                className="w-full h-28 px-4 py-3 rounded-xl border border-border bg-white text-sm placeholder:text-text-muted resize-none"
                placeholder="e.g., Advanced Algorithms, Machine Learning, Cloud Computing, Distributed Systems, Database Management, Software Architecture..."
                value={profile.masterSubjects}
                onChange={(e) =>
                  updateProfile("masterSubjects", e.target.value)
                }
              />
              <p className="text-xs text-text-muted">
                Comma-separated. AI picks the most relevant subjects per job.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Base Resumes */}
      <div className="card card-accent-blue overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveResumeTab("A")}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-4 text-sm font-semibold transition-all relative ${
              activeResumeTab === "A"
                ? "text-primary-700 bg-primary-50/50"
                : "text-text-muted hover:text-text-secondary hover:bg-gray-50"
            }`}
          >
            <FileText size={16} />
            Base Resume A (No Icons)
            {activeResumeTab === "A" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full" />
            )}
            {resumeAContent.trim() && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setActiveResumeTab("B")}
            className={`flex-1 flex items-center justify-center gap-2.5 px-6 py-4 text-sm font-semibold transition-all relative ${
              activeResumeTab === "B"
                ? "text-primary-700 bg-primary-50/50"
                : "text-text-muted hover:text-text-secondary hover:bg-gray-50"
            }`}
          >
            <Sparkles size={16} />
            Base Resume B (With Icons)
            <span className="text-[10px] font-normal text-text-muted">
              (Optional)
            </span>
            {activeResumeTab === "B" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-full" />
            )}
            {resumeBContent.trim() && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 relative">
          {/* LaTeX Mode Badge */}
          <div className="absolute top-8 right-8 z-10">
            <span className="text-xs font-mono font-semibold text-text-muted bg-gray-100 border border-border px-3 py-1 rounded-lg">
              LaTeX Mode
            </span>
          </div>

          {activeResumeTab === "A" && (
            <div className="animate-fade-in">
              <textarea
                className="w-full h-80 px-5 py-4 rounded-xl border border-border bg-gray-50 font-mono text-sm text-text-primary placeholder:text-text-muted resize-none leading-relaxed"
                placeholder={
                  "\\documentclass[a4paper,10pt]{article}\n\\usepackage[left=1in, right=1in, top=1in, bottom=1in]{geometry}\n\\title{My Resume}\n\\begin{document}\n\\maketitle\n\\section{Experience}\n...\n\\end{document}"
                }
                value={resumeAContent}
                onChange={(e) => setResumeAContent(e.target.value)}
              />
            </div>
          )}

          {activeResumeTab === "B" && (
            <div className="animate-fade-in">
              <textarea
                className="w-full h-80 px-5 py-4 rounded-xl border border-border bg-gray-50 font-mono text-sm text-text-primary placeholder:text-text-muted resize-none leading-relaxed"
                placeholder={
                  "\\documentclass[a4paper,10pt]{article}\n\\usepackage{fontawesome5}\n\\usepackage[left=1in, right=1in, top=1in, bottom=1in]{geometry}\n\\title{My Resume}\n\\begin{document}\n\\maketitle\n\\section{Experience}\n...\n\\end{document}"
                }
                value={resumeBContent}
                onChange={(e) => setResumeBContent(e.target.value)}
              />
              <p className="text-xs text-text-muted mt-2">
                Optional — used only when you check "Use Base Resume B (With
                Icons)" during generation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Save Footer */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-text-muted">
          <Info size={14} />
          <span className="text-xs">
            Changes to profile or templates affect all future applications.
          </span>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving || !resumeAContent.trim()}
          className="btn btn-primary px-6"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving ? "Saving..." : "Save All Configurations"}
        </button>
      </div>
    </div>
  );
}
