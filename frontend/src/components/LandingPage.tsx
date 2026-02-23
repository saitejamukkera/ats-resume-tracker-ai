"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Lock,
  FileCheck,
  Zap,
  CheckCircle,
  ArrowRight,
  Briefcase,
  Menu,
  X,
  Sun,
  Moon,
  Github,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTheme } from "../hooks/useTheme";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100 font-sans selection:bg-primary-100 dark:selection:bg-primary-900 selection:text-primary-900 dark:selection:text-primary-100 overflow-x-hidden">
      {/* Navigation */}
      <nav
        className={`fixed w-full z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-sm py-3"
            : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
              <Briefcase className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              <a href="/">TrackHire AI</a>
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Features
            </a>
            <a
              href="#privacy"
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Privacy
            </a>
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              Sign In
            </Link>
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a
              href="https://github.com/saitejamukkera/ats-resume-tracker-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title="View on GitHub — Open Source"
            >
              <Github size={18} />
            </a>
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-full bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <a
              href="https://github.com/saitejamukkera/ats-resume-tracker-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="View on GitHub"
            >
              <Github size={18} />
            </a>
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="p-2 text-gray-600 dark:text-gray-400"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 w-full bg-white dark:bg-zinc-900 shadow-xl border-t border-gray-100 dark:border-gray-800 p-6 flex flex-col gap-4 md:hidden"
          >
            <a
              href="#features"
              className="text-base font-medium text-gray-600 dark:text-gray-400"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="#privacy"
              className="text-base font-medium text-gray-600 dark:text-gray-400"
              onClick={() => setMobileMenuOpen(false)}
            >
              Privacy
            </a>
            <Link
              href="/login"
              className="text-base font-medium text-gray-600 dark:text-gray-400"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="w-full text-center px-5 py-3 rounded-xl bg-primary-600 text-white font-semibold"
              onClick={() => setMobileMenuOpen(false)}
            >
              Get Started
            </Link>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <header className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Abstract Background Elements */}
        <div className="absolute top-[-10%] right-[-5%] w-125 h-125 bg-primary-200/30 dark:bg-primary-900/20 rounded-full blur-3xl opacity-50 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-150 h-150 bg-blue-100/40 dark:bg-blue-900/20 rounded-full blur-3xl opacity-50" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <motion.div
                variants={fadeInUp}
                className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-primary-700 dark:text-primary-400 text-xs font-semibold uppercase tracking-wider"
              >
                <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                Now with AI Resume Analysis
              </motion.div>

              <motion.h1
                variants={fadeInUp}
                className="text-5xl lg:text-7xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-8 leading-[1.1]"
              >
                Master Your Job Search with{" "}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-primary-600 to-blue-600">
                  Intelligent Tracking
                </span>
              </motion.h1>

              <motion.p
                variants={fadeInUp}
                className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed"
              >
                Organize applications, optimize for ATS, and keep your data
                secure. The modern, privacy-first way to land your next role.
              </motion.p>

              <motion.div
                variants={fadeInUp}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Link
                  href="/login"
                  className="w-full sm:w-auto px-8 py-4 rounded-full bg-primary-600 text-white font-bold text-lg shadow-xl shadow-primary-500/30 hover:bg-primary-700 hover:shadow-primary-500/50 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                >
                  Start Tracking Free <ArrowRight size={20} />
                </Link>
                <a
                  href="#features"
                  className="w-full sm:w-auto px-8 py-4 rounded-full bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 font-bold text-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center"
                >
                  Learn More
                </a>
              </motion.div>
            </motion.div>
          </div>

          {/* Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 100, rotateX: 10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mt-20 relative mx-auto max-w-5xl"
          >
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200/50 dark:border-gray-800 bg-white dark:bg-zinc-900 ring-1 ring-gray-900/5 dark:ring-white/5">
              {/* Mock UI Header */}
              <div className="h-8 bg-gray-50 dark:bg-zinc-800 border-b border-gray-100 dark:border-gray-800 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                <div className="w-3 h-3 rounded-full bg-green-400/80" />
              </div>
              {/* Abstract UI Representation */}
              <div className="p-8 bg-white dark:bg-zinc-900 grid grid-cols-12 gap-6 h-100 lg:h-125">
                <div className="col-span-3 hidden lg:block bg-gray-50 dark:bg-zinc-800 rounded-xl border border-gray-100 dark:border-gray-800 h-full animate-pulse opacity-50" />
                <div className="col-span-12 lg:col-span-9 flex flex-col gap-6">
                  <div className="h-32 bg-linear-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-100/50 dark:border-primary-800/50 w-full" />
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-24 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-gray-800" />
                    <div className="h-24 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-gray-800" />
                    <div className="h-24 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-gray-800" />
                  </div>
                  <div className="flex-1 bg-gray-50 dark:bg-zinc-800 rounded-xl border border-gray-100 dark:border-gray-800" />
                </div>
              </div>

              {/* Overlay Text */}
              <div className="absolute inset-0 flex items-center justify-center bg-white/10 backdrop-blur-xs">
                <span className="px-6 py-3 bg-black/80 text-white rounded-full font-medium backdrop-blur-md shadow-2xl">
                  Interactive Dashboard Preview
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" className="py-24 bg-gray-50 dark:bg-zinc-950">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything you need to get hired
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Built for the modern job seeker. Powerful tools to manage your
              search without the complexity.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FileCheck,
                title: "ATS Compliance",
                desc: "Ensure your resume passes automated filters with our built-in ATS checker and optimization tips.",
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                icon: Shield,
                title: "Privacy First",
                desc: "Your data belongs to you. We use industry-standard encryption and never sell your personal information.",
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                icon: Zap,
                title: "Smart Automation",
                desc: "Auto-fill applications and track status updates seamlessly. Save hours on repetitive tasks.",
                color: "text-primary-600",
                bg: "bg-primary-50",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow"
              >
                <div
                  className={`w-14 h-14 ${feature.bg} rounded-xl flex items-center justify-center mb-6`}
                >
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy & Security Section */}
      <section
        id="privacy"
        className="py-24 bg-white dark:bg-black relative overflow-hidden"
      >
        <div className="container mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 text-green-700 dark:text-green-400 text-xs font-semibold uppercase tracking-wider mb-6">
                <Lock size={12} /> Bank-Grade Security
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                Your Career Data, <br />
                Safe and Secure.
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                We understand that your resume and job history are sensitive.
                That&apos;s why we built TrackHire AI with a security-first
                architecture.
              </p>

              <ul className="space-y-4">
                {[
                  "End-to-end encryption for all sensitive data",
                  "GDPR and CCPA compliant data handling",
                  "No third-party tracking or data selling",
                  "Secure cloud storage with daily backups",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-gray-700 dark:text-gray-300"
                  >
                    <CheckCircle
                      className="text-green-500 shrink-0"
                      size={20}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
          <div className="lg:w-1/2 relative">
            <div className="absolute inset-0 bg-linear-to-r from-green-500/20 to-teal-500/20 blur-3xl rounded-full" />
            <img
              src="https://images.unsplash.com/photo-1563986768609-322da13575f3?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&q=80"
              alt="Privacy and Security"
              className="relative rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-10"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gray-900 dark:bg-zinc-950 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-150 h-150 bg-primary-600/20 rounded-full blur-3xl opacity-50 translate-x-1/3 -translate-y-1/3" />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold mb-6">
            Ready to land your dream job?
          </h2>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            Join thousands of job seekers who are organizing their search and
            getting hired faster.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg shadow-white/10"
          >
            Get Started for Free <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-zinc-950 py-12 border-t border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Briefcase className="text-primary-600" size={24} />
              <span className="font-bold text-gray-900 dark:text-white text-lg">
                TrackHire AI
              </span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} TrackHire AI. All rights
              reserved.
            </div>
            <div className="flex gap-6 items-center">
              <a
                href="https://github.com/saitejamukkera/ats-resume-tracker-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center gap-1.5"
              >
                <Github size={16} />
                GitHub
              </a>
              <a
                href="#"
                className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Terms
              </a>
              <a
                href="#"
                className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Privacy
              </a>
              <a
                href="#"
                className="text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
