"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, Copy, CheckCircle, Loader2 } from "lucide-react";
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

export default function IntegrationsPage() {
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.profile.get();
        if (data) setProfile(data);
      } catch {
        /* not set yet */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

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
            Integrations
          </span>
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Connect TrackHire AI with your favorite tools
        </p>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="p-8 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
      >
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-gray-200/60 dark:border-gray-800/60">
          <div className="w-11 h-11 rounded-xl bg-linear-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/20 dark:to-indigo-800/20 flex items-center justify-center">
            <Mail size={22} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
              Auto-Tracking (Beta)
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              Automatically track application status updates by forwarding your
              emails
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Your Unique Forwarding Address
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
              Set up a forwarding rule in your email client (like Gmail) to
              auto-forward job application updates (e.g., from greenhouse.io,
              lever.co, or containing &quot;Application Status&quot;) to this
              address. Our AI will analyze the email and update your dashboard
              automatically.
            </p>

            <div className="flex items-center gap-3">
              <div className="flex-1 px-4 py-3 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700/60 rounded-lg font-mono text-sm text-gray-800 dark:text-gray-200 break-all select-all">
                {profile?.forwardingEmail || "Loading..."}
              </div>
              <button
                onClick={() => {
                  if (profile?.forwardingEmail) {
                    navigator.clipboard.writeText(profile.forwardingEmail);
                    toast.success("Address copied to clipboard!");
                  }
                }}
                disabled={!profile?.forwardingEmail}
                className="p-3 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700/60 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors text-gray-600 dark:text-gray-400 disabled:opacity-50"
                title="Copy Address"
              >
                <Copy size={18} />
              </button>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                {profile?.forwardingVerified ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">
                    <CheckCircle size={14} /> Gmail Verification Received
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-md">
                    Waiting for Gmail Verification... Check back here
                    occasionally.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-800/50 border border-gray-200/60 dark:border-gray-800/60 rounded-xl p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
              How to set up Gmail Forwarding
            </h3>

            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">
              {/* Step 1 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white dark:border-zinc-900 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xs font-bold">
                  1
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-gray-700/50 shadow-sm">
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white mb-1">
                    Add Forwarding Address
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Open Gmail Settings (⚙️) See all settings Forwarding and
                    POP/IMAP. Click "Add a forwarding address" and paste your
                    unique address from above.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white dark:border-zinc-900 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xs font-bold">
                  2
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-gray-700/50 shadow-sm">
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white mb-1">
                    Approve Confirmation
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Gmail will send a confirmation code. TrackHire AI will
                    intercept it! Just refresh this page in a minute to see the
                    "Gmail Verification Received" badge.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white dark:border-zinc-900 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xs font-bold">
                  3
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-gray-700/50 shadow-sm">
                  <h4 className="font-bold text-xs text-gray-900 dark:text-white mb-1">
                    Create a Filter
                  </h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Go to "Filters and Blocked Addresses" to create a new
                    filter.
                    <br />
                    <br />
                    <strong>Set "Has the words":</strong>{" "}
                    <code>move forward</code> (or other job status keywords).
                    <br />
                    <strong>Action:</strong> Check "Forward it to" and choose
                    your unique address.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
