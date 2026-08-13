"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, Maximize2 } from "lucide-react";
import { api } from "../../lib/api";
import type { UserProfile } from "../../types/dtos";
import { useToast } from "../../context/ToastContext";
import ApiKeySettings from "./ApiKeySettings";

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

      toast.success("Settings saved.");
    } catch {
      toast.error("Couldn’t save settings. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const activeResumeContent = activeResumeTab === "A" ? resumeAContent : resumeBContent;
  const resumeLineCount = Math.max(6, activeResumeContent.split("\n").length);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="settings-screen"
    >
      <motion.div variants={fadeInUp} className="settings-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-description">
          Manage your profile, API keys, and resume templates.
        </p>
      </motion.div>

      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-nav">
          <ul>
            {[
              ["#personal-information", "Personal Information"],
              ["#education", "Education"],
              ["#ai-provider", "AI Provider & API Key"],
              ["#resume-templates", "Base Resume Templates"],
            ].map(([href, label], index) => (
              <li key={href}>
                <a
                  href={href}
                  className={index === 0 ? "active" : ""}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-content">

      <motion.div
        variants={fadeInUp}
        id="personal-information"
        className="settings-section"
      >
        <div className="settings-section-heading">
          <h2>Personal Information</h2>
        </div>

        <div>
          <div className="settings-profile-grid">
            {[
              {
                label: "Full Name",
                field: "fullName" as const,
                placeholder: "John Doe",
                type: "text",
              },
              {
                label: "Email",
                field: "email" as const,
                placeholder: "john.doe@example.com",
                type: "email",
              },
              {
                label: "Phone",
                field: "phone" as const,
                placeholder: "(xxx) xxx-xxxx",
                type: "text",
              },
              {
                label: "LinkedIn Profile",
                field: "linkedinUrl" as const,
                placeholder: "https://linkedin.com/in/...",
                type: "url",
              },
              {
                label: "GitHub Profile",
                field: "githubUrl" as const,
                placeholder: "https://github.com/...",
                type: "url",
              },
            ].map((item) => (
              <div key={item.field}>
                <label htmlFor={`profile-${item.field}`} className="field-label">
                  {item.label}
                </label>
                <input
                  id={`profile-${item.field}`}
                  name={item.field}
                  autoComplete={item.field === "fullName" ? "name" : item.field === "phone" ? "tel" : item.field === "email" ? "email" : "url"}
                  type={item.type}
                  className="field"
                  placeholder={item.placeholder}
                  value={profile[item.field] || ""}
                  onChange={(e) => updateProfile(item.field, e.target.value)}
                />
              </div>
            ))}
          </div>

          <details className="settings-profile-more">
            <summary>Additional profile fields</summary>
            <div>
              <label htmlFor="profile-address" className="field-label">Address</label>
              <input id="profile-address" name="address" autoComplete="street-address" className="field" value={profile.address || ""} onChange={(event) => updateProfile("address", event.target.value)} />
              <label htmlFor="profile-portfolioUrl" className="field-label">Portfolio URL</label>
              <input id="profile-portfolioUrl" name="portfolioUrl" type="url" autoComplete="url" className="field" value={profile.portfolioUrl || ""} onChange={(event) => updateProfile("portfolioUrl", event.target.value)} />
            </div>
          </details>

          <div id="education" className="settings-education">
            <h2>Education</h2>

            <div className="settings-education-grid">
              <div>
                <label htmlFor="masters-degree" className="field-label">
                  Degree
                </label>
                <input
                  id="masters-degree"
                  name="masters-degree"
                  autoComplete="off"
                  type="text"
                  className="field"
                  placeholder="Master of Science in Computer Science"
                  value={profile.mastersDegree}
                  onChange={(e) =>
                    updateProfile("mastersDegree", e.target.value)
                  }
                />
              </div>
              <div>
                <label htmlFor="masters-gpa" className="field-label">
                  GPA
                </label>
                <input
                  id="masters-gpa"
                  name="masters-gpa"
                  inputMode="decimal"
                  autoComplete="off"
                  type="text"
                  className="field"
                  placeholder="4.0"
                  value={profile.mastersGpa}
                  onChange={(e) => updateProfile("mastersGpa", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="masters-subjects" className="field-label">
                Key Subjects (comma separated)
              </label>
              <textarea
                id="masters-subjects"
                name="masters-subjects"
                autoComplete="off"
                className="field"
                placeholder="For example: Advanced Algorithms, Machine Learning, Cloud Computing…"
                value={profile.masterSubjects}
                onChange={(e) =>
                  updateProfile("masterSubjects", e.target.value)
                }
              />
            </div>
          </div>
        </div>
      </motion.div>

      <section id="ai-provider" className="scroll-mt-8">
        <ApiKeySettings />
      </section>

      <motion.div
        variants={fadeInUp}
        id="resume-templates"
        className="settings-resume-section"
      >
        <h2>Base Resume Templates</h2>
        <div className="settings-resume-tabs">
          <button
            onClick={() => setActiveResumeTab("A")}
            className={`${
              activeResumeTab === "A"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Resume A (No Icons)
          </button>
          <button
            onClick={() => setActiveResumeTab("B")}
            className={`${
              activeResumeTab === "B"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Resume B (Icons) — Optional
          </button>
        </div>

        <div className="settings-resume-editor">
          <div aria-hidden="true">
            {Array.from({ length: resumeLineCount }, (_, index) => <span key={index}>{index + 1}</span>)}
          </div>
          <Maximize2 size={15} aria-hidden="true" />
          {activeResumeTab === "A" ? (
              <textarea
                aria-label="Resume A LaTeX template"
                placeholder={
                  "\\documentclass[a4paper,10pt]{article}\n\\usepackage[left=1in, right=1in, top=1in, bottom=1in]{geometry}\n\\title{My Resume}\n\\begin{document}\n\\maketitle\n\\section{Experience}\n...\n\\end{document}"
                }
                value={resumeAContent}
                onChange={(e) => setResumeAContent(e.target.value)}
              />
          ) : (
              <textarea
                aria-label="Resume B LaTeX template"
                placeholder={
                  "\\documentclass[a4paper,10pt]{article}\n\\usepackage{fontawesome5}\n\\usepackage[left=1in, right=1in, top=1in, bottom=1in]{geometry}\n\\title{My Resume}\n\\begin{document}\n\\maketitle\n\\section{Experience}\n...\n\\end{document}"
                }
                value={resumeBContent}
                onChange={(e) => setResumeBContent(e.target.value)}
              />
          )}
        </div>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="settings-save-bar"
      >
        <button
          onClick={handleSaveAll}
          disabled={saving || !resumeAContent.trim()}
          className="button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : null}
          {saving ? "Saving Settings…" : "Save All Configurations"}
        </button>
      </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
