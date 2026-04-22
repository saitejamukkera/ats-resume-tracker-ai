"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Save,
  Loader2,
  User,
  GraduationCap,
  FileText,
  Sparkles,
  Info,
} from "lucide-react";
import { api } from "../../lib/api";
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
    transition: { staggerChildren: 0.08 },
  },
};

export default function SettingsPage() {
  const toast = useToast();
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

  const [resumeAContent, setResumeAContent] = useState("");
  const [resumeBContent, setResumeBContent] = useState("");
  const [activeResumeTab, setActiveResumeTab] = useState<"A" | "B">("A");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.profile.get();
        if (data) setProfile(data);
      } catch {
        /* not set yet */
      }

      try {
        const resumes = await api.resumes.getBaseResumes();
        for (const r of resumes) {
          if (r.name === "Base Resume A") setResumeAContent(r.content || "");
          if (r.name === "Base Resume B") setResumeBContent(r.content || "");
        }
      } catch {
        /* backend down */
      }
    };
    load();
  }, []);

  const handleSaveAll = async () => {
    if (!resumeAContent.trim()) {
      toast.error("Base Resume A (No Icons) is required.");
      return;
    }

    setSaving(true);

    try {
      const savePromises: Promise<unknown>[] = [
        api.profile.save(profile),
        api.resumes.uploadBaseResume({
          name: "Base Resume A",
          content: resumeAContent,
          hasIcons: false,
        }),
      ];

      if (resumeBContent.trim()) {
        savePromises.push(
          api.resumes.uploadBaseResume({
            name: "Base Resume B",
            content: resumeBContent,
            hasIcons: true,
          }),
        );
      }

      await Promise.all(savePromises);

      toast.success("All configurations saved successfully!");
    } catch {
      toast.error("Failed to save. Is the backend running?");
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="max-w-4xl mx-auto space-y-6"
    >
      <motion.div variants={fadeInUp}>
        <h1 className="text-2xl font-extrabold tracking-tight">
          <span className="bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
            Settings
          </span>
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Configure your profile and resume templates
        </p>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="p-8 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
      >
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-gray-200/60 dark:border-gray-800/60">
          <div className="w-11 h-11 rounded-xl bg-linear-to-br from-primary-100 to-primary-50 dark:from-primary-900/20 dark:to-primary-800/20 flex items-center justify-center">
            <User
              size={22}
              className="text-primary-600 dark:text-primary-400"
            />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
              Personal Information
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
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
                placeholder: "John Doe",
                type: "text",
              },
              {
                label: "Address",
                field: "address" as const,
                placeholder: "Mountain View, CA",
                type: "text",
              },
              {
                label: "Phone",
                field: "phone" as const,
                placeholder: "(xxx) xxx-xxxx",
                type: "text",
              },
              {
                label: "Email",
                field: "email" as const,
                placeholder: "john.doe@example.com",
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
                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {item.label}{" "}
                  {item.optional && (
                    <span className="text-gray-300 dark:text-gray-600 font-normal">
                      (Optional)
                    </span>
                  )}
                </label>
                <input
                  type={item.type}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder={item.placeholder}
                  value={profile[item.field] || ""}
                  onChange={(e) => updateProfile(item.field, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-gray-200/60 dark:border-gray-800/60">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-linear-to-br from-primary-100 to-primary-50 dark:from-primary-900/20 dark:to-primary-800/20 flex items-center justify-center">
                <GraduationCap
                  size={18}
                  className="text-primary-600 dark:text-primary-400"
                />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Master&apos;s Education{" "}
                  <span className="text-gray-400 dark:text-gray-500 font-normal">
                    (Optional)
                  </span>
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Relevant subjects will be used to strengthen your cover
                  letters
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Degree
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="Master of Science in Computer Science"
                  value={profile.mastersDegree}
                  onChange={(e) =>
                    updateProfile("mastersDegree", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  GPA
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="4.0"
                  value={profile.mastersGpa}
                  onChange={(e) => updateProfile("mastersGpa", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Subjects Taken
              </label>
              <textarea
                className="w-full h-28 px-4 py-3 rounded-xl border border-gray-200/60 dark:border-gray-700/60 bg-white dark:bg-zinc-800 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 resize-none focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder="e.g., Advanced Algorithms, Machine Learning, Cloud Computing, Distributed Systems, Database Management, Software Architecture..."
                value={profile.masterSubjects}
                onChange={(e) =>
                  updateProfile("masterSubjects", e.target.value)
                }
              />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Comma-separated. AI picks the most relevant subjects per job.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5 overflow-hidden"
      >
        <div className="flex p-1.5 mx-6 mt-6 bg-gray-100/80 dark:bg-zinc-800/80 rounded-full">
          <button
            onClick={() => setActiveResumeTab("A")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeResumeTab === "A"
                ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <FileText size={16} />
            Resume A (No Icons)
            {resumeAContent.trim() && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
          <button
            onClick={() => setActiveResumeTab("B")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeResumeTab === "B"
                ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <Sparkles size={16} />
            Resume B (Icons)
            <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
              Optional
            </span>
            {resumeBContent.trim() && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        <div className="p-6 relative">
          <div className="absolute top-8 right-8 z-10">
            <span className="text-xs font-mono font-semibold text-gray-400 dark:text-gray-500 bg-gray-100/80 dark:bg-zinc-800/80 border border-gray-200/60 dark:border-gray-700/60 px-3 py-1 rounded-full">
              LaTeX Mode
            </span>
          </div>

          {activeResumeTab === "A" && (
            <div>
              <textarea
                className="w-full h-80 px-5 py-4 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/80 dark:bg-zinc-800/50 font-mono text-sm text-gray-900 dark:text-white placeholder:text-gray-400 resize-none leading-relaxed focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder={
                  "\\documentclass[a4paper,10pt]{article}\n\\usepackage[left=1in, right=1in, top=1in, bottom=1in]{geometry}\n\\title{My Resume}\n\\begin{document}\n\\maketitle\n\\section{Experience}\n...\n\\end{document}"
                }
                value={resumeAContent}
                onChange={(e) => setResumeAContent(e.target.value)}
              />
            </div>
          )}

          {activeResumeTab === "B" && (
            <div>
              <textarea
                className="w-full h-80 px-5 py-4 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/80 dark:bg-zinc-800/50 font-mono text-sm text-gray-900 dark:text-white placeholder:text-gray-400 resize-none leading-relaxed focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder={
                  "\\documentclass[a4paper,10pt]{article}\n\\usepackage{fontawesome5}\n\\usepackage[left=1in, right=1in, top=1in, bottom=1in]{geometry}\n\\title{My Resume}\n\\begin{document}\n\\maketitle\n\\section{Experience}\n...\n\\end{document}"
                }
                value={resumeBContent}
                onChange={(e) => setResumeBContent(e.target.value)}
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Optional — used only when you check &quot;Use Base Resume B
                (With Icons)&quot; during generation.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="flex items-center justify-between px-2"
      >
        <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
          <Info size={14} />
          <span className="text-xs">
            Changes to profile or templates affect all future applications.
          </span>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving || !resumeAContent.trim()}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving ? "Saving..." : "Save All Configurations"}
        </button>
      </motion.div>
    </motion.div>
  );
}
