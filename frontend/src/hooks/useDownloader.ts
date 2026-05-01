import { useState } from "react";
import { api } from "../lib/api";
import { getFormattedFilename } from "../lib/utils";
import { useToast } from "../context/ToastContext";

export function useDownloader() {
  const [isDownloading, setIsDownloading] = useState(false);
  const toast = useToast();

  const handleDownload = async (
    blobPromise: Promise<Blob>,
    filename: string,
    successMessage: string,
    errorMessage: string,
  ) => {
    setIsDownloading(true);
    try {
      const blob = await blobPromise;
      if (blob.size === 0) {
        throw new Error("File is empty");
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(successMessage);
    } catch (error) {
      console.error(error);
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadResumePdf = async (
    applicationId: number,
    jobId: string,
    company: string,
    fullName: string,
  ) => {
    await handleDownload(
      api.resumes.downloadPdf(applicationId),
      getFormattedFilename(fullName, jobId, company, "Resume", "pdf"),
      "Resume PDF Downloaded",
      "Failed to download Resume PDF",
    );
  };

  const downloadResumeDocx = async (
    applicationId: number,
    jobId: string,
    company: string,
    fullName: string,
  ) => {
    await handleDownload(
      api.resumes.downloadResumeDocx(applicationId),
      getFormattedFilename(fullName, jobId, company, "Resume", "docx"),
      "Resume Word Doc Downloaded",
      "Failed to download Resume Word Doc",
    );
  };

  const downloadCoverLetterPdf = async (
    applicationId: number,
    jobId: string,
    company: string,
    fullName: string,
  ) => {
    await handleDownload(
      api.resumes.downloadCoverLetterPdf(applicationId),
      getFormattedFilename(fullName, jobId, company, "Cover_Letter", "pdf"),
      "Cover Letter PDF Downloaded",
      "Failed to download Cover Letter PDF",
    );
  };

  const downloadCoverLetterDocx = async (
    applicationId: number,
    jobId: string,
    company: string,
    fullName: string,
  ) => {
    await handleDownload(
      api.resumes.downloadCoverLetterDocx(applicationId),
      getFormattedFilename(fullName, jobId, company, "Cover_Letter", "docx"),
      "Cover Letter Word Doc Downloaded",
      "Failed to download Cover Letter Word Doc",
    );
  };

  const downloadCoverLetterText = async (
    content: string,
    jobId: string,
    company: string,
    fullName: string,
  ) => {
    const blob = new Blob([content], { type: "text/plain" });
    await handleDownload(
      Promise.resolve(blob),
      getFormattedFilename(fullName, jobId, company, "Cover_Letter", "txt"),
      "Cover Letter Text Downloaded",
      "Failed to download Cover Letter Text",
    );
  };

  return {
    isDownloading,
    downloadResumePdf,
    downloadResumeDocx,
    downloadCoverLetterPdf,
    downloadCoverLetterDocx,
    downloadCoverLetterText,
  };
}
