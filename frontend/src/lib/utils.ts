export function getFormattedFilename(
  userName: string,
  position: string,
  jobId: string,
  applicationId: number,
  type: "Resume" | "Cover_Letter" | "CoverLetter",
  extension: "pdf" | "docx" | "txt" = "pdf",
): string {
  const safeUser = (userName || "Candidate").replace(/[^a-zA-Z0-9]/g, "_");
  const safePosition = (position || "Position")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_");
  const id = jobId && jobId.toLowerCase() !== "none" && jobId.toLowerCase() !== "na"
    ? jobId.replace(/[^a-zA-Z0-9]/g, "")
    : String(applicationId);
  const safeId = id ? `_${id}` : "";

  return `${safeUser}_${safePosition}${safeId}_${type}.${extension}`;
}
