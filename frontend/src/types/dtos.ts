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
}

export interface ResumeGenerationRequest {
  jobDescription: string;
  baseResumeId?: number;
  customPrompt?: string;
}

export interface ResumeGenerationResponse {
  latexContent: string;
  coverLetterContent: string;
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
}
