export type ApplicationStatus =
  | "ACTIVE"
  | "IN_PROCESS"
  | "REJECTED"
  | "OFFER_RECEIVED"
  | "DRAFT";
export const ApplicationStatus = {
  ACTIVE: "ACTIVE" as ApplicationStatus,
  IN_PROCESS: "IN_PROCESS" as ApplicationStatus,
  REJECTED: "REJECTED" as ApplicationStatus,
  OFFER_RECEIVED: "OFFER_RECEIVED" as ApplicationStatus,
  DRAFT: "DRAFT" as ApplicationStatus,
};

export interface JobApplicationRequest {
  position: string;
  jobId: string;
  company: string;
  location: string;
  jobDescription: string;
  outcome?: ApplicationStatus;
  note?: string;
}

export interface JobApplicationResponse {
  id: number;
  position: string;
  jobId: string;
  company: string;
  location: string;
  jobDescription: string;
  outcome: ApplicationStatus;
  appliedOn: string;
  hasGeneratedResume: boolean;
  hasCoverLetter: boolean;
  generatedResumeContent?: string;
  coverLetterContent?: string;
  note?: string;
  atsScore?: number;
  impactScore?: number;
  scoreBreakdown?: string;
}

export interface CheckDuplicateResponse {
  duplicate: boolean;
  existingApplication: {
    id: number;
    position: string;
    company: string;
    appliedOn: string;
  } | null;
}

export interface ResumeGenerationRequest {
  jobDescription: string;
  baseResumeId?: number;
  customPrompt?: string;
  useIconResume?: boolean;
}

export interface ResumeGenerationResponse {
  latexContent: string;
  coverLetterContent: string;
  generatedResumeContent?: string;
  atsScore?: number;
  impactScore?: number;
  scoreBreakdown?: Record<string, { raw: number; weighted: number; max: number; label: string }>;
}

export interface PdfSyncMapEntry {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceLine: number;
  sourceColumn?: number;
  sourceEndColumn?: number;
  sourceEndLine?: number;
  confidence: "exact" | "nearest";
}

export interface PdfSyncDiagnostic {
  level: "warning" | "error";
  message: string;
  line?: number;
}

export interface PdfSyncResponse {
  pdfBase64: string;
  syncMap: PdfSyncMapEntry[];
  compileDiagnostics?: PdfSyncDiagnostic[];
}

export interface UserProfile {
  id?: number;
  fullName: string;
  address: string;
  phone: string;
  email: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  masterSubjects: string;
  mastersDegree: string;
  mastersGpa: string;
  skills?: string;
}
