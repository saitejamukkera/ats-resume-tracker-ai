export function DashboardCompanyMark({ company }: { company: string }) {
  const key = company.toLowerCase();

  if (key === "microsoft") {
    return <span className="dashboard-company-mark microsoft" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  if (key === "dropbox") {
    return <span className="dashboard-company-mark dropbox" aria-hidden="true"><i /><i /><i /><i /></span>;
  }
  if (key === "openai") return <span className="dashboard-company-mark openai" aria-hidden="true">◎</span>;
  if (key === "amazon") return <span className="dashboard-company-mark amazon" aria-hidden="true">a</span>;
  if (key === "notion") return <span className="dashboard-company-mark notion" aria-hidden="true">N</span>;

  return <span className="dashboard-company-mark fallback" aria-hidden="true">{company.charAt(0).toUpperCase()}</span>;
}
