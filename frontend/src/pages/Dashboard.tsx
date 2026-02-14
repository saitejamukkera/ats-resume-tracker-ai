import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { type JobApplicationResponse, ApplicationStatus } from "../types/dtos";
import type { UserProfile } from "../types/dtos";
import { getFormattedFilename } from "../lib/utils";
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
} from "lucide-react";
import { StatusDropdown } from "../components/StatusDropdown";
import { ConfirmModal } from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";

export default function Dashboard() {
  const [applications, setApplications] = useState<JobApplicationResponse[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadApplications();
    api.profile.get().then(setUserProfile).catch(console.error);
  }, []);

  const loadApplications = async () => {
    try {
      const data = await api.applications.getAll();
      setApplications(data);
    } catch (error) {
      console.error("Failed to load applications", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await api.applications.delete(deleteTarget);
      setApplications(applications.filter((app) => app.id !== deleteTarget));
      toast.success("Application deleted successfully.");
    } catch (error) {
      console.error("Failed to delete application", error);
      toast.error("Failed to delete application.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = async (
    app: JobApplicationResponse,
    newStatus: string,
  ) => {
    const previousApplications = [...applications];
    const updatedApplications = applications.map((a) =>
      a.id === app.id ? { ...a, outcome: newStatus as ApplicationStatus } : a,
    );
    setApplications(updatedApplications);

    try {
      await api.applications.update(app.id, {
        position: app.position,
        company: app.company,
        jobId: app.jobId,
        location: app.location,
        jobDescription: app.jobDescription,
        outcome: newStatus as ApplicationStatus,
      });
    } catch (error) {
      console.error("Failed to update status", error);
      setApplications(previousApplications);
    }
  };

  // Stats
  const totalApps = applications.length;
  const activeApps = applications.filter(
    (a) => a.outcome === ApplicationStatus.ACTIVE,
  ).length;
  const inProcessApps = applications.filter(
    (a) => a.outcome === ApplicationStatus.IN_PROCESS,
  ).length;
  const offersReceived = applications.filter(
    (a) => a.outcome === ApplicationStatus.OFFER_RECEIVED,
  ).length;

  // Filter
  const filteredApps = applications.filter((app) => {
    const matchesSearch =
      app.position.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.company.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || app.outcome === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-text-muted text-sm font-medium">
          Loading applications...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Track and manage your job applications
          </p>
        </div>
        <Link to="/new" className="btn btn-primary">
          <Plus size={16} />
          New Application
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        <div className="card card-interactive p-5 flex items-center gap-4">
          <div className="stat-icon stat-icon-violet">
            <Briefcase size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-text-primary tracking-tight">
              {totalApps}
            </p>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Total
            </p>
          </div>
        </div>

        <div className="card card-interactive p-5 flex items-center gap-4">
          <div className="stat-icon stat-icon-emerald">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-text-primary tracking-tight">
              {activeApps}
            </p>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Active
            </p>
          </div>
        </div>

        <div className="card card-interactive p-5 flex items-center gap-4">
          <div className="stat-icon stat-icon-blue">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-text-primary tracking-tight">
              {inProcessApps}
            </p>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              In Process
            </p>
          </div>
        </div>

        <div className="card card-interactive p-5 flex items-center gap-4">
          <div className="stat-icon stat-icon-amber">
            <Award size={20} />
          </div>
          <div>
            <p className="text-2xl font-extrabold text-text-primary tracking-tight">
              {offersReceived}
            </p>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
              Offers
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="card p-3 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Search by position or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background-alt/50 text-sm placeholder:text-text-muted"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2.5 px-3 rounded-xl border border-border bg-background-alt/50 text-sm text-text-secondary cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_PROCESS">In Process</option>
            <option value="REJECTED">Rejected</option>
            <option value="OFFER_RECEIVED">Offer Received</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-background-alt/30">
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em]">
                  Position
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em]">
                  Job ID
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em]">
                  Company
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em]">
                  Location
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em]">
                  Applied
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em]">
                  Status
                </th>
                <th className="px-6 py-3.5 text-[11px] font-bold text-text-muted uppercase tracking-[0.08em] text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="stagger-children">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                        <Briefcase size={28} className="text-primary-300" />
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-text-primary">
                          {searchQuery || statusFilter !== "ALL"
                            ? "No matching applications"
                            : "No applications yet"}
                        </p>
                        <p className="text-sm text-text-muted mt-1">
                          {searchQuery || statusFilter !== "ALL"
                            ? "Try adjusting your search or filter"
                            : "Start tracking your job search by adding your first application!"}
                        </p>
                      </div>
                      {!searchQuery && statusFilter === "ALL" && (
                        <Link to="/new" className="btn btn-primary mt-2">
                          <Plus size={16} />
                          Add Application
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
                      className="border-b border-border-light table-row-hover group"
                    >
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-text-primary text-[13px]">
                          {app.position}
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-[13px] text-text-muted font-mono">
                          {app.jobId || "—"}
                        </p>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-[13px] text-text-secondary font-medium">
                          {app.company}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-text-muted">
                          {app.location || "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-text-muted">
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
                          {app.hasGeneratedResume && (
                            <button
                              onClick={async (e) => {
                                e.preventDefault();
                                try {
                                  const blob = await api.resumes.downloadPdf(
                                    app.id,
                                  );
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = getFormattedFilename(
                                    userProfile?.fullName || "Candidate",
                                    app.jobId,
                                    app.company,
                                    "Resume",
                                    "pdf",
                                  );
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                } catch (error) {
                                  console.error("PDF download failed", error);
                                  toast.error(
                                    "Failed to download PDF. The LaTeX may have compilation errors.",
                                  );
                                }
                              }}
                              className="btn btn-ghost p-2 rounded-lg"
                              title="Download Resume PDF"
                            >
                              <FileText size={16} />
                            </button>
                          )}
                          <Link
                            to={`/applications/${app.id}`}
                            className="btn btn-ghost p-2 rounded-lg"
                            title="View Details"
                          >
                            <ExternalLink size={16} />
                          </Link>
                          <button
                            onClick={() => handleDelete(app.id)}
                            className="btn btn-ghost p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
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

        {/* Table Footer */}
        {filteredApps.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-surface-hover/50 flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Showing{" "}
              <span className="font-semibold text-text-secondary">
                {filteredApps.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-text-secondary">
                {totalApps}
              </span>{" "}
              applications
            </p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
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
    </div>
  );
}
