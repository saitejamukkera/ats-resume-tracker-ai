"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  FileText,
  FolderOpen,
  Gauge,
  Github,
  ListFilter,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  X,
} from "lucide-react";
import { Logo } from "./Logo";

const applications = [
  { company: "Notion", role: "Product Manager", status: "Interview", tone: "success", progress: 75, date: "May 12, 2024", next: "Onsite · May 22", mark: "notion" },
  { company: "OpenAI", role: "Technical Program Manager", status: "Interview", tone: "success", progress: 60, date: "May 5, 2024", next: "Technical Screen", mark: "openai" },
  { company: "Linear", role: "Product Manager", status: "In Progress", tone: "warning", progress: 40, date: "Apr 28, 2024", next: "Take-home", mark: "linear" },
  { company: "Dropbox", role: "Senior Product Manager", status: "In Progress", tone: "warning", progress: 30, date: "Apr 20, 2024", next: "Recruiter Screen", mark: "dropbox" },
  { company: "Microsoft", role: "PM, AI Platform", status: "Applied", tone: "neutral", progress: 20, date: "Apr 18, 2024", next: "—", mark: "microsoft" },
  { company: "Amazon", role: "Product Manager", status: "Rejected", tone: "neutral", progress: 100, date: "Apr 10, 2024", next: "—", mark: "amazon" },
] as const;

const capabilities = [
  { number: "01", title: "Application Tracking", copy: "Keep roles, dates, notes, and outcomes together in one focused workspace." },
  { number: "02", title: "Resume Tailoring", copy: "Create a role-specific resume and cover letter from the profile you provide." },
  { number: "03", title: "Provider Choice", copy: "Choose Google, OpenAI, or Anthropic and use your own provider key." },
];

const controlPoints = [
  "Choose your preferred AI provider",
  "Edit generated content before downloading",
  "Keep application notes in one workspace",
  "Delete application records when you choose",
];

function CompanyMark({ name }: { name: string }) {
  if (name === "microsoft") {
    return <span className="company-mark microsoft-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  if (name === "dropbox") {
    return <span className="company-mark dropbox-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  if (name === "linear") return <span className="company-mark linear-mark" aria-hidden="true" />;
  if (name === "openai") return <span className="company-mark openai-mark" aria-hidden="true">◎</span>;
  if (name === "amazon") return <span className="company-mark amazon-mark" aria-hidden="true">a</span>;
  return <span className="company-mark notion-mark" aria-hidden="true">N</span>;
}

function ProductPreview() {
  const sidebar = [
    { icon: BriefcaseBusiness, label: "Applications", active: true },
    { icon: FileText, label: "Resumes" },
    { icon: Sparkles, label: "ATS Optimizer" },
    { icon: FolderOpen, label: "Documents" },
    { icon: StickyNote, label: "Notes" },
    { icon: Gauge, label: "Career Insights" },
    { icon: Settings, label: "Settings" },
  ];

  return (
    <>
      <div className="landing-product-capture" role="region" aria-label="TrackHire application dashboard preview">
        <Image
          src="/dashboard-editorial-preview.png"
          width={1792}
          height={768}
          alt="TrackHire dashboard showing application metrics, filters, and tracked roles"
          priority
        />
      </div>
      <div className="landing-product landing-product-live" role="region" aria-label="TrackHire application dashboard preview">
      <aside className="landing-product-sidebar" aria-label="Preview navigation">
        <p className="landing-product-brand">TrackHire AI</p>
        <div className="landing-product-nav">
          {sidebar.map(({ icon: Icon, label, active }) => (
            <div key={label} className={active ? "active" : undefined}>
              <Icon size={14} strokeWidth={1.65} aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="landing-product-trust">
          <ShieldCheck size={14} aria-hidden="true" />
          <span><strong>Your workspace</strong><small>Applications and documents</small></span>
        </div>
      </aside>

      <div className="landing-product-main">
        <div className="landing-product-toolbar">
          <span className="landing-product-mobile-brand">TrackHire AI</span>
          <p>Applications</p>
          <div className="landing-product-actions">
            <div className="landing-product-search"><Search size={13} aria-hidden="true" /><span>Search applications…</span></div>
            <span className="landing-preview-control"><ListFilter size={13} aria-hidden="true" /> Filters</span>
            <Link href="/register"><Plus size={13} aria-hidden="true" /> Add Application</Link>
          </div>
        </div>

        <div className="landing-product-stats">
          <div><small>Total Applications</small><strong>24</strong></div>
          <div><small>In Progress</small><strong className="warning-number">10</strong></div>
          <div><small>Interviews</small><strong className="success-number">4</strong></div>
          <div><small>Offers</small><strong className="success-number">1</strong></div>
          <div><small>Rejections</small><strong>9</strong></div>
        </div>

        <div className="landing-product-table" role="region" aria-label="Example job applications">
          <div className="landing-product-row landing-product-head">
            <span>Company</span><span>Role</span><span>Status</span><span>Progress</span><span>Applied</span><span>Next Step</span><span />
          </div>
          {applications.map((application) => (
            <div className="landing-product-row" key={application.company}>
              <span className="company-cell"><CompanyMark name={application.mark} />{application.company}</span>
              <span>{application.role}</span>
              <span><i className={`preview-status ${application.tone}`}>{application.status}</i></span>
              <span className="preview-progress"><i><b style={{ width: `${application.progress}%` }} /></i><small>{application.progress}%</small></span>
              <span>{application.date}</span>
              <span>{application.next}</span>
              <span><MoreHorizontal size={14} aria-hidden="true" /></span>
            </div>
          ))}
          </div>
        </div>
        <Link href="/register" className="landing-product-view-all">View All Applications <span aria-hidden="true">›</span></Link>
      </div>
    </>
  );
}

function DocumentPreview() {
  return (
    <div className="landing-document-preview" role="region" aria-label="Tailored resume preview">
      <div className="document-toolbar"><span>Documents</span><strong>Senior Product Manager Resume</strong><span className="document-preview-action">Download</span></div>
      <div className="document-tabs"><strong>Preview</strong><span>ATS Score</span><span>Edit</span><span>History</span></div>
      <div className="document-content">
        <aside>
          <small>FILE</small>
          <p><FileText size={15} aria-hidden="true" /><span><strong>spm_resume.pdf</strong><small>2 pages · 210 KB</small></span></p>
          <small>ATS SCORE</small>
          <div className="ats-score"><span>85</span><p><strong>Good Match</strong><small>View details</small></p></div>
          <small>SUGGESTIONS</small>
          <ul><li>Add quantified impact</li><li>Include relevant keywords</li><li>Strengthen skills section</li></ul>
          <span className="document-apply">Apply Suggestions</span>
        </aside>
        <article>
          <h3>Senior Product Manager</h3>
          <small>San Francisco, CA · me@email.com · linkedin.com/in/me</small>
          <h4>SUMMARY</h4>
          <p>Product leader with 8+ years of experience building user-centered products that drive growth and retention.</p>
          <h4>EXPERIENCE</h4>
          <strong>OpenAI</strong>
          <p>Technical Program Manager</p>
          <ul><li>Led cross-functional teams to deliver platform features used by millions.</li><li>Improved release velocity through process automation and tooling.</li></ul>
          <h4>SKILLS</h4>
          <p>Product Strategy · Roadmapping · Stakeholder Management</p>
        </article>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMobileMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileMenuOpen]);

  return (
    <div className="landing-page min-h-screen bg-background text-text-primary">
      <a href="#main-content" className="skip-link">Skip to Content</a>
      <div className="landing-binding" aria-hidden="true"><i className="binding-cutout first" /><i className="binding-cutout second" /></div>

      <header className="landing-header relative z-40">
        <nav aria-label="Primary navigation" className="landing-nav">
          <Link href="/" aria-label="TrackHire AI home"><Logo size="lg" className="landing-logo" /></Link>
          <div className="landing-desktop-nav">
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
            <Link href="/login">Sign In</Link>
            <Link href="/register" className="landing-header-cta">Get Started <span aria-hidden="true">→</span></Link>
          </div>
          <span className="landing-theme-preview" aria-hidden="true">☼</span>
          <button type="button" className="icon-button landing-menu-button" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            {mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </nav>
        {mobileMenuOpen && <div className="landing-mobile-menu"><a href="#features">Features</a><a href="#privacy">Privacy</a><Link href="/login">Sign In</Link><Link href="/register">Get Started</Link></div>}
      </header>

      <main id="main-content">
        <section className="landing-hero paper-edge">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <h1>Master Your<br />Job Search</h1>
              <p>Organize applications, optimize for ATS, and keep your career data private.</p>
              <div><Link href="/register" className="button-primary">Start Tracking Free</Link><a href="#features" className="button-secondary">See How It Works</a></div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="features" className="landing-features paper-edge">
          <div className="landing-feature-intro">
            <h2>Built for job seekers.</h2>
            <p>Track every application, tailor your resume for ATS,<br />and move forward with confidence.</p>
          </div>
          <div className="landing-section-grid landing-capabilities">
            <div><h2>Everything You<br />Need to Get Hired</h2><p>TrackHire AI helps you organize applications, create tailored documents, and move through your search with clarity.</p></div>
            <ol>{capabilities.map((item) => <li key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.copy}</p></div></li>)}</ol>
          </div>
        </section>

        <section id="privacy" className="landing-privacy paper-edge">
          <div className="landing-privacy-grid">
            <div><h2>Your Career Data,<br />Under Your Control.</h2><p>Choose your provider, review generated content, and manage the application records in your workspace.</p><ul>{controlPoints.map((point) => <li key={point}><Check size={17} aria-hidden="true" />{point}</li>)}</ul></div>
            <DocumentPreview />
          </div>
        </section>

        <section className="landing-cta paper-edge">
          <h2>Ready to Land Your Next Role?</h2>
          <p>Join TrackHire AI today and take control of your job search.</p>
          <div><Link href="/register" className="button-primary">Get Started for Free</Link><a href="#features" className="button-secondary">See How It Works</a></div>
        </section>
      </main>

      <footer className="landing-footer paper-edge">
        <div><div><Logo size="lg" /><p>Organize applications, tailor career documents, and keep every next step in view.</p></div><nav aria-label="Footer navigation"><a href="https://github.com/saitejamukkera/ats-resume-tracker-ai" target="_blank" rel="noopener noreferrer"><Github size={15} aria-hidden="true" />GitHub</a><a href="#">Terms</a><a href="#privacy">Privacy</a><a href="mailto:contact@trackhire.ai">Contact</a></nav><small>© {new Date().getFullYear()} TrackHire AI. All rights reserved.</small></div>
      </footer>
    </div>
  );
}
