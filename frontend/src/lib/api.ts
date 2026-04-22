import type {
  JobApplicationRequest,
  JobApplicationResponse,
  ResumeGenerationRequest,
  ResumeGenerationResponse,
  UserProfile,
} from "../types/dtos";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ── Token storage (access token in memory + localStorage) ───────────

let cachedToken: string | null = null;

export const tokenStorage = {
  get: () => {
    if (cachedToken !== null) return cachedToken;
    if (typeof window !== "undefined") {
      cachedToken = localStorage.getItem("jwt");
      return cachedToken;
    }
    return null;
  },
  set: (token: string) => {
    cachedToken = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("jwt", token);
    }
  },
  remove: () => {
    cachedToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("jwt");
    }
  },
};

// ── Session expired event bus ───────────────────────────────────────

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export const onSessionExpired = (listener: SessionExpiredListener) => {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
};

function emitSessionExpired() {
  sessionExpiredListeners.forEach((listener) => listener());
}

// ── JWT expiry helpers ──────────────────────────────────────────────

function tokenExpiresWithin(ms: number): boolean {
  const token = tokenStorage.get();
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = payload.exp * 1000;
    return expiresAt - Date.now() < ms;
  } catch {
    return true;
  }
}

async function ensureFreshToken(): Promise<void> {
  if (tokenExpiresWithin(3 * 60 * 1000)) {
    const refreshed = await attemptRefresh();
    if (!refreshed) {
      tokenStorage.remove();
      emitSessionExpired();
      throw new Error("Session expired. Please log in again.");
    }
  }
}

// ── Silent token refresh with request queuing ───────────────────────

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (data.token) {
      tokenStorage.set(data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = silentRefresh().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

// ── Core fetch wrapper with 401 interception ────────────────────────

const apiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  _isRetry = false,
): Promise<Response> => {
  const token = tokenStorage.get();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401 && !_isRetry) {
    const url = typeof input === "string" ? input : input.toString();
    const isAuthEndpoint =
      url.includes("/api/auth/login") ||
      url.includes("/api/auth/register") ||
      url.includes("/api/auth/refresh");

    if (!isAuthEndpoint) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        return apiFetch(input, init, true);
      }
      tokenStorage.remove();
      emitSessionExpired();
    }
  }

  return response;
};

// ── Types ───────────────────────────────────────────────────────────

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

// ── API namespace ───────────────────────────────────────────────────

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<AuthResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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
        credentials: "include",
        body: JSON.stringify({ fullName, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Registration failed");
      if (data.token) tokenStorage.set(data.token);
      return data;
    },
    logout: async (): Promise<void> => {
      const token = tokenStorage.get();
      tokenStorage.remove();
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => {});
    },
    me: async (): Promise<AuthResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/me`);
      if (!response.ok) throw new Error("Not authenticated");
      return response.json();
    },
    sendOtp: async (email: string): Promise<AuthResponse> => {
      const response = await apiFetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to send OTP");
      return data;
    },
    verifyOtpRegister: async (
      email: string,
      password: string,
      fullName: string,
      otp: string,
    ): Promise<AuthResponse> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/auth/verify-otp-register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ fullName, email, password, otp }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Verification failed");
      if (data.token) tokenStorage.set(data.token);
      return data;
    },
    forgotPassword: async (email: string): Promise<AuthResponse> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to send reset code");
      return data;
    },
    resetPassword: async (
      email: string,
      otp: string,
      newPassword: string,
    ): Promise<AuthResponse> => {
      const response = await apiFetch(
        `${API_BASE_URL}/api/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp, newPassword }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Password reset failed");
      return data;
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to generate");
      }
      return response.json();
    },
    generateFromJdStream: async (
      jobDescription: string,
      useIconResume: boolean,
      onEvent: (eventType: string, data: Record<string, unknown>) => void,
    ): Promise<void> => {
      await ensureFreshToken();
      const response = await apiFetch(
        `${API_BASE_URL}/api/resumes/generate-from-jd/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ jobDescription, useIconResume }),
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message || "Failed to start generation stream",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream available");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let dataLines: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
            dataLines = [];
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5));
          } else if (line === "" && currentEvent && dataLines.length > 0) {
            // Empty line = end of SSE event; parse accumulated data lines
            try {
              const data = JSON.parse(dataLines.join("\n").trim());
              onEvent(currentEvent, data);
            } catch {
              // skip malformed JSON
            }
            currentEvent = "";
            dataLines = [];
          }
        }
      }
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to generate resume");
      }
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
    getBaseResumes: async (): Promise<{ name: string; content: string }[]> => {
      const response = await apiFetch(`${API_BASE_URL}/api/resumes/base`);
      if (!response.ok) throw new Error("Failed to fetch base resumes");
      return response.json();
    },
    uploadBaseResume: async (data: {
      name: string;
      content: string;
      hasIcons: boolean;
    }): Promise<void> => {
      const response = await apiFetch(`${API_BASE_URL}/api/resumes/base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to upload base resume");
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
