"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import useSWR, { mutate } from "swr";
import { api } from "../../lib/api";
import {
  type JobApplicationResponse,
  ApplicationStatus,
} from "../../types/dtos";
import { getFormattedFilename } from "../../lib/utils";
import {
  Plus,
  ExternalLink,
  Trash2,
  Briefcase,
  TrendingUp,
  Clock,
  Award,
  FileText,
  Search,
  Filter,
  ArrowRight,
  StickyNote,
} from "lucide-react";
import { StatusDropdown } from "../StatusDropdown";
import { ConfirmModal } from "../ConfirmModal";
import { NotePopover } from "../NoteModal";
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

const cardHover = {
  rest: { y: 0 },
  hover: { y: -4, transition: { duration: 0.2 } },
};

export default function DashboardPage() {
  const {
    data: applications = [],
    error,
    isLoading,
  } = useSWR("/api/applications", () => api.applications.getAll());

  const { data: userProfile } = useSWR("/api/profile", () => api.profile.get());

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const toast = useToast();

  const handleDelete = async (id: number) => {
    setDeleteTarget(id);
  };
  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await api.applications.delete(deleteTarget);
      mutate(
        "/api/applications",
        applications.filter((app) => app.id !== deleteTarget),
        false,
      );
      toast.success("Application deleted successfully.");
    } catch (error) {
      console.error("Failed to delete application", error);
      toast.error("Failed to delete application.");
      mutate("/api/applications"); // Revalidate on error
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = async (
    app: JobApplicationResponse,
    newStatus: string,
  ) => {
    const updatedApplications = applications.map((a) =>
      a.id === app.id ? { ...a, outcome: newStatus as ApplicationStatus } : a,
    );

    // Optimistic update
    mutate("/api/applications", updatedApplications, false);

    try {
      await api.applications.update(app.id, {
        position: app.position,
        company: app.company,
        jobId: app.jobId,
        location: app.location,
        jobDescription: app.jobDescription,
        outcome: newStatus as ApplicationStatus,
      });
      toast.success("Status updated successfully.");
      mutate("/api/applications"); // Revalidate to ensure server consistency
    } catch (error) {
      console.error("Failed to update status", error);
      toast.error("Failed to update status.");
      mutate("/api/applications"); // Revert/Revalidate on error
    }
  };

  const { totalApps, activeApps, inProcessApps, offersReceived } = useMemo(
    () => ({
      totalApps: applications.length,
      activeApps: applications.filter(
        (a) => a.outcome === ApplicationStatus.ACTIVE,
      ).length,
      inProcessApps: applications.filter(
        (a) => a.outcome === ApplicationStatus.IN_PROCESS,
      ).length,
      offersReceived: applications.filter(
        (a) => a.outcome === ApplicationStatus.OFFER_RECEIVED,
      ).length,
    }),
    [applications],
  );

  const filteredApps = useMemo(() => {
    const query = searchQuery.toLowerCase();

    // Priority map: lower number = higher in the list
    const statusPriority: Record<string, number> = {
      [ApplicationStatus.IN_PROCESS]: 0,
      [ApplicationStatus.OFFER_RECEIVED]: 0,
      [ApplicationStatus.ACTIVE]: 1,
      [ApplicationStatus.DRAFT]: 1,
      [ApplicationStatus.REJECTED]: 2,
    };

    return applications
      .filter((app) => {
        const matchesSearch =
          app.position.toLowerCase().includes(query) ||
          app.company.toLowerCase().includes(query) ||
          app.jobId?.toLowerCase().includes(query);
        const matchesStatus =
          statusFilter === "ALL" || app.outcome === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const priorityA = statusPriority[a.outcome] ?? 1;
        const priorityB = statusPriority[b.outcome] ?? 1;
        if (priorityA !== priorityB) return priorityA - priorityB;
        // Within the same priority group, show newest first
        return (
          new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime()
        );
      });
  }, [applications, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-2 border-primary-200 dark:border-primary-800 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-gray-400 dark:text-gray-500 text-sm font-medium">
          Loading applications...
        </p>
      </div>
    );
  }

  const STAT_CARDS = [
    {
      label: "Total",
      value: totalApps,
      icon: Briefcase,
      gradient: "from-violet-500 to-purple-600",
      bg: "bg-violet-50 dark:bg-violet-900/20",
      text: "text-violet-600 dark:text-violet-400",
    },
    {
      label: "Active",
      value: activeApps,
      icon: TrendingUp,
      gradient: "from-emerald-500 to-green-600",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      text: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "In Process",
      value: inProcessApps,
      icon: Clock,
      gradient: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      text: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Offers",
      value: offersReceived,
      icon: Award,
      gradient: "from-amber-500 to-orange-600",
      bg: "bg-amber-50 dark:bg-amber-900/20",
      text: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer}>
      <motion.div
        variants={fadeInUp}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              Dashboard
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            Track and manage your job applications
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
        >
          <Plus size={16} />
          New Application
        </Link>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {STAT_CARDS.map((stat) => (
          <motion.div
            key={stat.label}
            variants={cardHover}
            initial="rest"
            whileHover="hover"
            className="p-5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 flex items-center gap-4 shadow-sm hover:shadow-lg transition-shadow ring-1 ring-gray-900/5 dark:ring-white/5"
          >
            <div
              className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}
            >
              <stat.icon size={20} className={stat.text} />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                {stat.value}
              </p>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="p-3 mb-6 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 flex flex-col sm:flex-row gap-3 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/5"
      >
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by position or company or job ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-zinc-800/50 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-zinc-800/50 text-sm text-gray-700 dark:text-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
          >
            <option value="ALL">Status</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_PROCESS">In Process</option>
            <option value="REJECTED">Rejected</option>
            <option value="OFFER_RECEIVED">Offer Received</option>
          </select>
        </div>
      </motion.div>

      <motion.div
        variants={fadeInUp}
        className="rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-800/60 shadow-sm overflow-hidden ring-1 ring-gray-900/5 dark:ring-white/5"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-zinc-800/30">
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
                  Position
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
                  Job ID
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
                  Company
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
                  Location
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
                  Applied
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em]">
                  Status
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.08em] text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-20 gap-5">
                      <div className="w-20 h-20 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                        <Briefcase
                          size={32}
                          className="text-primary-300 dark:text-primary-600"
                        />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900 dark:text-white text-lg">
                          {searchQuery || statusFilter !== "ALL"
                            ? "No matching applications"
                            : "No applications yet"}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-xs mx-auto">
                          {searchQuery || statusFilter !== "ALL"
                            ? "Try adjusting your search or filter"
                            : "Start tracking your job search by adding your first application!"}
                        </p>
                      </div>
                      {!searchQuery && statusFilter === "ALL" && (
                        <Link
                          href="/new"
                          className="inline-flex items-center gap-2 px-5 py-2.5 mt-1 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5"
                        >
                          <Plus size={16} />
                          Add Application
                          <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  return (
                    <tr
                      key={app.id}
                      className="border-b border-gray-100/80 dark:border-gray-800/50 hover:bg-primary-50/30 dark:hover:bg-primary-900/5 transition-colors group"
                    >
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-gray-900 dark:text-white text-[13px]">
                          {app.position}
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-[13px] text-gray-500 dark:text-gray-400 font-mono">
                          {app.jobId || "—"}
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-[13px] text-gray-700 dark:text-gray-300 font-medium">
                          {app.company}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {app.location || "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(app.appliedOn).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusDropdown
                          currentStatus={app.outcome}
                          onStatusChange={(status) =>
                            handleStatusChange(app, status)
                          }
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <NotePopover
                            application={app}
                            onSave={async (noteContent) => {
                              try {
                                await api.applications.update(app.id, {
                                  company: app.company,
                                  position: app.position,
                                  jobId: app.jobId,
                                  jobDescription: app.jobDescription,
                                  location: app.location,
                                  outcome: app.outcome,
                                  note: noteContent,
                                });
                                // Optimistically update the UI without waiting for refetch
                                mutate(
                                  "/api/applications",
                                  (currentData: any) => {
                                    if (!currentData) return currentData;
                                    return currentData.map(
                                      (item: JobApplicationResponse) =>
                                        item.id === app.id
                                          ? { ...item, note: noteContent }
                                          : item,
                                    );
                                  },
                                  false,
                                );
                                // Revalidate in background
                                mutate("/api/applications");
                              } catch (error) {
                                console.error("Failed to save note", error);
                                throw error;
                              }
                            }}
                            triggerButton={
                              <button
                                className="p-2 rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/20 transition-colors relative outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                title="Notes"
                              >
                                <StickyNote size={16} />
                                {app.note && (
                                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-500 rounded-full" />
                                )}
                              </button>
                            }
                          />
                          <Link
                            href={`/applications/${app.id}`}
                            className="p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
                            title="View Details"
                          >
                            <ExternalLink size={16} />
                          </Link>
                          <button
                            onClick={() => handleDelete(app.id)}
                            className="p-2 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredApps.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-200/60 dark:border-gray-800/60 bg-gray-50/30 dark:bg-zinc-800/20 flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-600 dark:text-gray-300">
                {filteredApps.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-600 dark:text-gray-300">
                {totalApps}
              </span>{" "}
              applications
            </p>
          </div>
        )}
      </motion.div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Application"
        message="Are you sure you want to delete this application? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        icon="delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
}
