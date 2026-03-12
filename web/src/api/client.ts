const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ApplicationSubmission {
  channel: 'SMS' | 'EMAIL';
  endpointValue: string;
  consentGiven: boolean;
  candidateName?: string;
  location?: string;
}

export interface ApplicationStatus {
  applicationId: string;
  status: string;
  candidateName: string | null;
  session: {
    state: string;
    currentStep: string;
    startedAt: string;
    finishedAt: string | null;
  } | null;
}

export interface ReviewerApplication {
  id: string;
  status: string;
  createdAt: string;
  candidate: { fullName: string | null; primaryEmail: string | null };
  sessionState: string | null;
  sessionStep: string | null;
  completedAt: string | null;
  messageCount: number;
  avgScore: number | null;
}

export interface CandidatePacket {
  application_id: string;
  status: string;
  candidate: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
  };
  extracted: Record<string, unknown>;
  transcript: Array<{ direction: string; channel: string; body: string; at: string }>;
  automation_tests: Array<{ type: string; result: string; latency_ms: number | null }>;
  rubric: {
    evaluations: Array<{
      id: string;
      scores: Array<{ dimension: string; score: number; rationale: string | null; reviewer: string }>;
    }>;
  };
  review_notes: Array<{ note: string; reviewer: string; at: string }>;
}

export const api = {
  submitApplication: (data: ApplicationSubmission) =>
    request<{ applicationId: string; sessionId: string; message: string }>('/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getApplicationStatus: (id: string) =>
    request<ApplicationStatus>(`/applications/${id}`),

  retryQuestion: (id: string) =>
    request<{ message: string }>(`/applications/${id}/retry`, { method: 'POST' }),

  // Reviewer (requires x-reviewer-key header)
  listApplications: (key: string, status?: string) =>
    request<{ data: ReviewerApplication[]; total: number }>(
      `/reviewer/applications${status ? `?status=${status}` : ''}`,
      { headers: { 'x-reviewer-key': key } },
    ),

  getApplication: (key: string, id: string) =>
    request<CandidatePacket>(`/reviewer/applications/${id}`, {
      headers: { 'x-reviewer-key': key },
    }),

  submitScores: (
    key: string,
    applicationId: string,
    reviewerId: string,
    scores: Array<{ dimension: string; score: number; rationale?: string }>,
  ) =>
    request<{ evaluationId: string }>(`/reviewer/applications/${applicationId}/score`, {
      method: 'POST',
      headers: { 'x-reviewer-key': key },
      body: JSON.stringify({ reviewerId, scores }),
    }),

  advanceCandidate: (key: string, applicationId: string, reviewerId: string, note?: string) =>
    request<{ success: boolean }>(`/reviewer/applications/${applicationId}/advance`, {
      method: 'POST',
      headers: { 'x-reviewer-key': key },
      body: JSON.stringify({ reviewerId, note }),
    }),

  rejectCandidate: (key: string, applicationId: string, reviewerId: string, reasonCode: string, note?: string) =>
    request<{ success: boolean }>(`/reviewer/applications/${applicationId}/reject`, {
      method: 'POST',
      headers: { 'x-reviewer-key': key },
      body: JSON.stringify({ reviewerId, reasonCode, note }),
    }),

  syncAts: (key: string, applicationId: string, provider: 'greenhouse' | 'lever') =>
    request<{ success: boolean }>(`/reviewer/applications/${applicationId}/sync-ats`, {
      method: 'POST',
      headers: { 'x-reviewer-key': key },
      body: JSON.stringify({ provider }),
    }),
};
