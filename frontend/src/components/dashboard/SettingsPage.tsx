"use client";

import { useState, useEffect, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Loader2, Maximize2 } from "lucide-react";
import { api } from "../../lib/api";
import type { UserProfile } from "../../types/dtos";
import { useToast } from "../../context/ToastContext";
import ApiKeySettings from "./ApiKeySettings";

type SettingsSection = "personal" | "education" | "ai-provider" | "resume-templates";

const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "personal", label: "Personal Information" },
  { id: "education", label: "Education" },
  { id: "ai-provider", label: "AI Provider & API Key" },
  { id: "resume-templates", label: "Base Resume Templates" },
];

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
  const [activeSection, setActiveSection] = useState<SettingsSection>("personal");

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

  const handleSectionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % SETTINGS_SECTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = SETTINGS_SECTIONS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = SETTINGS_SECTIONS[nextIndex];
    setActiveSection(nextSection.id);
    document.getElementById(`settings-tab-${nextSection.id}`)?.focus();
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
          <ul role="tablist" aria-orientation="vertical">
            {SETTINGS_SECTIONS.map(({ id, label }, index) => (
              <li key={id}>
                <button
                  type="button"
                  role="tab"
                  id={`settings-tab-${id}`}
                  aria-controls={`settings-panel-${id}`}
                  aria-selected={activeSection === id}
                  tabIndex={activeSection === id ? 0 : -1}
                  className={activeSection === id ? "active" : ""}
                  onClick={() => setActiveSection(id)}
                  onKeyDown={(event) => handleSectionKeyDown(event, index)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-content">
          <motion.section
            variants={fadeInUp}
            id="settings-panel-personal"
            role="tabpanel"
            aria-labelledby="settings-tab-personal"
            hidden={activeSection !== "personal"}
            className="settings-section"
          >
              <div className="settings-section-heading">
                <h2>Personal Information</h2>
              </div>

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
                  {
                    label: "Address",
                    field: "address" as const,
                    placeholder: "City, State",
                    type: "text",
                  },
                  {
                    label: "Portfolio URL",
                    field: "portfolioUrl" as const,
                    placeholder: "https://yourportfolio.com",
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
                      autoComplete={item.field === "fullName" ? "name" : item.field === "phone" ? "tel" : item.field === "email" ? "email" : item.field === "address" ? "street-address" : "url"}
                      type={item.type}
                      className="field"
                      placeholder={item.placeholder}
                      value={profile[item.field] || ""}
                      onChange={(e) => updateProfile(item.field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
          </motion.section>

          <motion.section
            variants={fadeInUp}
            id="settings-panel-education"
            role="tabpanel"
            aria-labelledby="settings-tab-education"
            hidden={activeSection !== "education"}
            className="settings-education"
          >
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
          </motion.section>

          <section
            id="settings-panel-ai-provider"
            role="tabpanel"
            aria-labelledby="settings-tab-ai-provider"
            hidden={activeSection !== "ai-provider"}
          >
            <ApiKeySettings />
          </section>

          <motion.section
            variants={fadeInUp}
            id="settings-panel-resume-templates"
            role="tabpanel"
            aria-labelledby="settings-tab-resume-templates"
            hidden={activeSection !== "resume-templates"}
            className="settings-resume-section"
          >
              <h2>Base Resume Templates</h2>
              <div className="settings-resume-tabs">
                <button
                  type="button"
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
                  type="button"
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
          </motion.section>

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
