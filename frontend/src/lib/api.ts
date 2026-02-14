import type {
  JobApplicationRequest,
  JobApplicationResponse,
  ResumeGenerationRequest,
  ResumeGenerationResponse,
  UserProfile,
} from "../types/dtos";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

export const tokenStorage = {
  get: () => localStorage.getItem("jwt"),
  set: (token: string) => localStorage.setItem("jwt", token),
  remove: () => localStorage.removeItem("jwt"),
};

const apiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const token = tokenStorage.get();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
};

export interface GenerateFromJdResponse {
  applicationId: number;
  position: string;
  company: string;
  jobId: string;
  location: string;
  latexContent: string;
  coverLetterContent: string;
}

export interface AuthResponse {
  email: string;
  fullName: string;
  provider: string;
  message?: string;
  token?: string;
}

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<AuthResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Login failed");
      if (data.token) tokenStorage.set(data.token);
      return data;
    },
    register: async (
      email: string,
      password: string,
      fullName: string,
    ): Promise<AuthResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Registration failed");
      if (data.token) tokenStorage.set(data.token);
      return data;
    },
    logout: async (): Promise<void> => {
      tokenStorage.remove();
      await apiFetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST" }).catch(() => {});
    },
    me: async (): Promise<AuthResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/me`);
      if (!response.ok) throw new Error("Not authenticated");
      return response.json();
    },
  },
  applications: {
    getAll: async (): Promise<JobApplicationResponse[]> => {
      const response = await apiFetch(`${API_BASE_URL}/api/applications`);
      if (!response.ok) throw new Error("Failed to fetch applications");
      return response.json();
    },
    create: async (
      data: JobApplicationRequest,
    ): Promise<JobApplicationResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create application");
      return response.json();
    },
    update: async (
      id: number,
      data: JobApplicationRequest,
    ): Promise<JobApplicationResponse> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/applications/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!response.ok) throw new Error("Failed to update application");
      return response.json();
    },
    getById: async (id: number): Promise<JobApplicationResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/applications/${id}`);
      if (!response.ok) throw new Error("Failed to fetch application");
      return response.json();
    },
    delete: async (id: number): Promise<void> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/applications/${id}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Failed to delete application");
    },
  },
  resumes: {
    generateFromJd: async (
      jobDescription: string,
      useIconResume: boolean,
    ): Promise<GenerateFromJdResponse> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/generate-from-jd`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobDescription, useIconResume }),
        },
      );
      if (!response.ok) throw new Error("Failed to generate");
      return response.json();
    },
    generate: async (
      applicationId: number,
      data: ResumeGenerationRequest,
    ): Promise<ResumeGenerationResponse> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/generate/${applicationId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (!response.ok) throw new Error("Failed to generate resume");
      return response.json();
    },
    getPdfUrl: (applicationId: number) =>
      `${API_BASE_URL}/api/resumes/${applicationId}/pdf`,
    downloadPdf: async (applicationId: number): Promise<Blob> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/${applicationId}/pdf`,
      );
      if (!response.ok) {
        if (response.status === 500) {
          throw new Error(
            "PDF compilation failed. The LaTeX content may contain errors.",
          );
        }
        throw new Error("Failed to download PDF");
      }
      return response.blob();
    },
    downloadCoverLetterPdf: async (applicationId: number): Promise<Blob> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/${applicationId}/cover-letter/pdf`,
      );
      if (!response.ok) {
        throw new Error("Failed to download Cover Letter PDF");
      }
      return response.blob();
    },
    downloadResumeDocx: async (applicationId: number): Promise<Blob> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/${applicationId}/docx`,
      );
      if (!response.ok) {
        throw new Error("Failed to download Resume Word document");
      }
      return response.blob();
    },
    downloadCoverLetterDocx: async (applicationId: number): Promise<Blob> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/${applicationId}/cover-letter/docx`,
      );
      if (!response.ok) {
        throw new Error("Failed to download Cover Letter Word document");
      }
      return response.blob();
    },
    getBaseResumeCount: async (): Promise<number> => {
      const response = await apiFetch(`${API_BASE_URL}/api/resumes/base/count`);
      if (!response.ok) throw new Error("Failed to check base resumes");
      return response.json();
    },
    updateContent: async (
      applicationId: number,
      resumeContent: string | null,
      coverLetterContent: string | null,
    ): Promise<void> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/${applicationId}/content`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeContent, coverLetterContent }),
        },
      );
      if (!response.ok) throw new Error("Failed to save content");
    },
  },
  profile: {
    get: async (): Promise<UserProfile | null> => {
      const response = await apiFetch(`${API_BASE_URL}/api/profile`);
      if (response.status === 204) return null;
      if (!response.ok) throw new Error("Failed to fetch profile");
      return response.json();
    },
    save: async (data: UserProfile): Promise<UserProfile> => {
      const response = await apiFetch(`${API_BASE_URL}/api/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to save profile");
      return response.json();
    },
  },
};
