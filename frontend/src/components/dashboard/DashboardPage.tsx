"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  ListFilter,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import { api } from "../../lib/api";
import { ApplicationStatus, type JobApplicationResponse } from "../../types/dtos";
import { StatusDropdown } from "../StatusDropdown";
import { ConfirmModal } from "../ConfirmModal";
import { useToast } from "../../context/ToastContext";
import { PageHeader } from "../ui/primitives";
import { DashboardCompanyMark } from "../DashboardCompanyMark";
import { NotePopover } from "../NoteModal";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const EMPTY_APPLICATIONS: JobApplicationResponse[] = [];

const formatApplicationDate = (value: string) =>
  dateFormatter.format(new Date(value.includes("T") ? value : `${value}T00:00:00`));

export default function DashboardPage() {
  const { data: applicationData, error, isLoading } = useSWR(
    "/api/applications",
    () => api.applications.getAll(),
  );
  const applications = Array.isArray(applicationData) ? applicationData : EMPTY_APPLICATIONS;
  const hasInvalidResponse = applicationData !== undefined && !Array.isArray(applicationData);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expandedMobileId, setExpandedMobileId] = useState<number | "first" | null>("first");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const toast = useToast();

  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    try {
      await api.applications.delete(deleteTarget);
      mutate("/api/applications", applications.filter((app) => app.id !== deleteTarget), false);
      toast.success("Application deleted.");
    } catch (deleteError) {
      console.error("Failed to delete application", deleteError);
      toast.error("Couldn’t delete the application. Try again.");
      mutate("/api/applications");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleStatusChange = async (app: JobApplicationResponse, newStatus: string) => {
    const updated = applications.map((item) =>
      item.id === app.id ? { ...item, outcome: newStatus as ApplicationStatus } : item,
    );
    mutate("/api/applications", updated, false);
    try {
      await api.applications.update(app.id, {
        position: app.position,
        company: app.company,
        jobId: app.jobId,
        location: app.location,
        jobDescription: app.jobDescription,
        outcome: newStatus as ApplicationStatus,
      });
      toast.success("Application status updated.");
      mutate("/api/applications");
    } catch (statusError) {
      console.error("Failed to update status", statusError);
      toast.error("Couldn’t update the status. Try again.");
      mutate("/api/applications");
    }
  };

  const handleNoteSave = async (app: JobApplicationResponse, note: string) => {
    const updatedApplication = { ...app, note };
    mutate(
      "/api/applications",
      applications.map((item) => item.id === app.id ? updatedApplication : item),
      false,
    );
    try {
      await api.applications.update(app.id, {
        position: app.position,
        company: app.company,
        jobId: app.jobId,
        location: app.location,
        jobDescription: app.jobDescription,
        outcome: app.outcome,
        note,
      });
      toast.success(note ? "Note saved." : "Note removed.");
      mutate("/api/applications");
    } catch (noteError) {
      console.error("Failed to update note", noteError);
      toast.error("Couldn’t update the note. Try again.");
      mutate("/api/applications");
      throw noteError;
    }
  };

  const metrics = useMemo(
    () => [
      { label: "Total Applications", value: applications.length },
      { label: "Active", value: applications.filter((app) => app.outcome === ApplicationStatus.ACTIVE).length },
      { label: "In Process", value: applications.filter((app) => app.outcome === ApplicationStatus.IN_PROCESS).length },
      { label: "Offers", value: applications.filter((app) => app.outcome === ApplicationStatus.OFFER_RECEIVED).length },
    ],
    [applications],
  );

  const filteredApps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return applications
      .filter((app) => {
        const matchesQuery =
          app.position.toLowerCase().includes(query) ||
          app.company.toLowerCase().includes(query) ||
          app.jobId?.toLowerCase().includes(query);
        return matchesQuery && (statusFilter === "ALL" || app.outcome === statusFilter);
      })
      .sort((a, b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime());
  }, [applications, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-4" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true" />
        <p className="text-sm font-medium text-text-secondary">Loading Applications…</p>
      </div>
    );
  }

  if (error || hasInvalidResponse) {
    return (
      <div className="surface mx-auto mt-20 max-w-xl p-8 text-center" role="alert">
        <h1 className="font-display text-3xl font-medium">Applications Couldn’t Load</h1>
        <p className="mt-3 text-text-secondary">Check your connection, then refresh this page to try again.</p>
      </div>
    );
  }

  const rowActions = (app: JobApplicationResponse) => (
    <NotePopover
      application={app}
      onSave={(note) => handleNoteSave(app, note)}
      onDeleteApplication={() => setDeleteTarget(app.id)}
      triggerButton={
        <button type="button" className="dashboard-more-button" aria-label={`More options for ${app.position}`}>
          <MoreVertical size={21} aria-hidden="true" />
        </button>
      }
    />
  );

  return (
    <div className="dashboard-screen animate-fade-in">
      <PageHeader
        title="Dashboard"
        description="Track and manage your job applications."
        action={
          <Link href="/new" className="button-primary dashboard-new-button">
            <Plus size={17} aria-hidden="true" /> New Application
          </Link>
        }
      />

      <a href="mailto:contact@trackhire.ai" className="dashboard-support"><CircleHelp size={18} aria-hidden="true" /> Support</a>

      <dl className="dashboard-metrics grid grid-cols-2 md:grid-cols-4">
        {metrics.map((metric, index) => (
          <div key={metric.label} className={index > 0 ? "border-l border-border" : ""}>
            <dt className="text-sm font-medium text-text-primary">{metric.label.replace(" Applications", "")}</dt>
            <dd className={`mt-2 text-3xl font-medium leading-none tabular-nums ${metric.label === "Active" ? "text-success" : metric.label === "In Process" ? "text-warning" : metric.label === "Offers" ? "text-success" : "text-text-primary"}`}>{metric.value}</dd>
          </div>
        ))}
      </dl>

      <div className="dashboard-controls flex flex-col sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search applications</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-primary" size={21} aria-hidden="true" />
          <input
            type="search"
            name="application-search"
            autoComplete="off"
            placeholder="Search by role, company, or job ID…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="field dashboard-search-input"
          />
        </label>
        <label className="dashboard-status-filter relative">
          <span className="sr-only">Filter by status</span>
          <ListFilter className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2" size={19} aria-hidden="true" />
          <select className="select-field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">Status</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_PROCESS">In Process</option>
            <option value="DRAFT">Draft</option>
            <option value="REJECTED">Rejected</option>
            <option value="OFFER_RECEIVED">Offer Received</option>
          </select>
        </label>
      </div>

      <section className="dashboard-list surface overflow-hidden" aria-label="Application list">
        {filteredApps.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-16 text-center">
            <BriefcaseBusiness size={34} strokeWidth={1.4} className="text-primary-600" aria-hidden="true" />
            <h2 className="mt-5 font-display text-3xl font-medium">
              {searchQuery || statusFilter !== "ALL" ? "No Matching Applications" : "No Applications Yet"}
            </h2>
            <p className="mt-2 max-w-sm text-text-secondary">
              {searchQuery || statusFilter !== "ALL" ? "Adjust the search or status filter to see more results." : "Add your first role to begin tracking your search."}
            </p>
            {!searchQuery && statusFilter === "ALL" && (
              <Link href="/new" className="button-primary mt-6">
                Add Application <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="dashboard-table-wrap hidden overflow-x-auto lg:block">
              <table className="dashboard-table w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3">Position</th>
                    <th className="px-5 py-3">Job ID</th>
                    <th className="px-5 py-3">Company</th>
                    <th className="px-5 py-3">Location</th>
                    <th className="px-5 py-3">Applied</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.map((app) => (
                    <tr key={app.id} className="border-b border-border last:border-b-0 hover:bg-surface-muted">
                      <td className="max-w-[240px] px-5 py-4">
                        <Link className="block truncate font-medium text-text-primary hover:text-primary-600" href={`/applications/${app.id}`}>{app.position}</Link>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-text-muted">{app.jobId || "—"}</td>
                      <td className="px-5 py-4 font-medium text-text-primary"><span className="dashboard-company-cell"><DashboardCompanyMark company={app.company} />{app.company}</span></td>
                      <td className="px-5 py-4 text-text-secondary">{app.location || "—"}</td>
                      <td className="px-5 py-4 text-text-secondary tabular-nums">{formatApplicationDate(app.appliedOn)}</td>
                      <td className="px-5 py-4"><StatusDropdown currentStatus={app.outcome} onStatusChange={(status) => handleStatusChange(app, status)} /></td>
                      <td className="px-4 py-2">
                        <div className="dashboard-row-actions">
                          <Link href={`/applications/${app.id}`} className="button-secondary dashboard-view-button">View</Link>
                          {rowActions(app)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="dashboard-mobile-list divide-y divide-border lg:hidden">
              {filteredApps.map((app, index) => {
                const isExpanded = expandedMobileId === app.id || (expandedMobileId === "first" && index === 0);
                return (
                <li key={app.id} className={isExpanded ? "expanded" : undefined}>
                  <div className="dashboard-mobile-row">
                    <button type="button" className="dashboard-expand-button" aria-label={`${isExpanded ? "Collapse" : "Expand"} ${app.position}`} aria-expanded={isExpanded} onClick={() => setExpandedMobileId(isExpanded ? null : app.id)}>{isExpanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}</button>
                    <DashboardCompanyMark company={app.company} />
                    <div className="dashboard-mobile-role"><Link href={`/applications/${app.id}`}>{app.position}</Link><span>{app.company}</span></div>
                    <div className="dashboard-mobile-date"><span>{formatApplicationDate(app.appliedOn)}</span><StatusDropdown currentStatus={app.outcome} onStatusChange={(status) => handleStatusChange(app, status)} /></div>
                    {rowActions(app)}
                  </div>
                  {isExpanded && <div className="dashboard-mobile-details"><div><span>Job ID</span><strong>{app.jobId || "—"}</strong></div><div><span>Location</span><strong>{app.location || "—"}</strong></div></div>}
                </li>
              );})}
            </ul>
            <p className="dashboard-list-count border-t border-border px-5 py-3 text-xs text-text-muted">
              Showing <span className="font-semibold text-text-secondary tabular-nums">{filteredApps.length}</span> of <span className="font-semibold text-text-secondary tabular-nums">{applications.length}</span> applications
            </p>
          </>
        )}
      </section>
      <p className="dashboard-mobile-updated lg:hidden">Last updated just now</p>

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
