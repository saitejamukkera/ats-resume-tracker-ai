export function getCompanyInitials(companyName: string): string {
  if (!companyName) return "CO";
  return companyName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 4); // Limit to 4 chars
}

export function getFormattedFilename(
  userName: string,
  jobId: string,
  companyName: string,
  type: "Resume" | "Cover_Letter" | "CoverLetter",
  extension: "pdf" | "docx" | "txt" = "pdf",
): string {
  const safeUserName = (userName || "Candidate").replace(/[^a-zA-Z0-9]/g, "_");
  const safeJobId =
    jobId && jobId.toLowerCase() !== "none"
      ? `_${jobId.replace(/[^a-zA-Z0-9]/g, "")}`
      : "";
  const companyInitials = getCompanyInitials(companyName);

  return `${safeUserName}${safeJobId}_${companyInitials}_${type}.${extension}`;
}
