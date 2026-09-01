const API_BASE_URL = 'http://127.0.0.1:5000';
const REQUEST_TIMEOUT_MS = 180_000; // uploads run extract + embed + pin + anchor

let authToken: string | null = localStorage.getItem('blockscribe_token');

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) localStorage.setItem('blockscribe_token', token);
  else localStorage.removeItem('blockscribe_token');
};

export const getAuthToken = () => authToken;

const authHeaders = (): Record<string, string> =>
  authToken ? { Authorization: `Bearer ${authToken}` } : {};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers || {}) },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || `Request failed (${response.status})`);
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};

const postJson = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// ---------- types ----------

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  wallet_pubkey: string;
}

export interface Paper {
  id: string;
  title: string;
  discipline: string;
  language: string;
  visibility: string;
  license: string;
  doi: string;
  authors: string;
  abstract: string;
  keywords: string;
  created_at: string;
  embargo_until?: string | null;
  version_id: string;
  version_no: number;
  file_hash: string;
  cid: string;
  full_text_available: boolean;
  metadata_cid: string;
  status: string;
  pda_address: string;
  author_name: string;
  author_id: string;
  institution: string;
  gateway_url: string;
  score?: number;
}

export interface Version {
  id: string;
  version_no: number;
  file_hash: string;
  cid: string;
  metadata_cid: string;
  status: string;
  pda_address: string;
  created_at: string;
  previous_version_id?: string | null;
}

export interface Anchor {
  version_id?: string;
  instruction: string;
  pda_address: string;
  signature: string;
  slot: number;
  status: string;
  confirmed_at?: string | null;
}

export interface Review {
  id: string;
  version_id: string;
  recommendation: string;
  review_text: string;
  review_cid: string;
  review_hash: string;
  reviewer_signature: string;
  signed_at: string;
  reviewer: string;
}

export interface SimilaritySummary {
  model: string;
  threshold: number;
  max_score: number;
  flagged_chunks: number;
  total_chunks: number;
  ran_at?: string;
  report?: SimilarityReport;
}

export interface SimilarityMatch {
  source_version_id: string;
  source_submission_id: string;
  score: number;
  matched_text: string;
  matched_chunk_index: number;
}

export interface SimilarityPassage {
  chunk_start: number;
  chunk_end: number;
  passage_text: string;
  top_score: number;
  matches: SimilarityMatch[];
}

export interface SimilarityReport {
  model: string;
  threshold: number;
  total_chunks: number;
  flagged_chunks: number;
  max_score: number;
  passages: SimilarityPassage[];
}

export interface PlagiarismResult extends SimilarityReport {
  already_deposited: boolean;
  file_hash: string;
}

export interface RelatedPaper {
  submission_id?: string;
  title?: string;
  score?: number;
}

export interface PaperDetail extends Paper {
  versions: Version[];
  anchors: Anchor[];
  reviews: Review[];
  similarity: SimilaritySummary | null;
  related: RelatedPaper[];
}

export interface DepositResult {
  submission_id: string;
  version_id: string;
  version_no: number;
  title: string;
  authors: string;
  abstract: string;
  discipline: string;
  file_hash: string;
  cid: string;
  metadata_cid: string;
  similarity: { max_score: number; flagged_chunks: number; total_chunks: number; passages: number };
  anchor: Anchor & { error?: string };
}

export interface VerifyResult {
  exists: boolean;
  verified: boolean;
  hash: string;
  pda_address: string;
  record?: {
    version_id: string;
    version_no: number;
    status: string;
    deposited_at: string;
    submission_id: string;
    title: string;
    authors: string;
    doi: string;
    institution: string;
  };
  anchors?: Anchor[];
}

export interface Assignment {
  id: string;
  version_id: string;
  state: string;
  due_at?: string | null;
  assigned_at: string;
  title: string;
  submission_id: string;
  version_no: number;
  version_status: string;
}

export interface ReviewerCandidate {
  user_id: string;
  display_name: string;
  email: string;
  score: number;
  evidence_submission_id: string;
}

export interface Stats {
  papers: number;
  versions: number;
  anchored: number;
  reviews: number;
  users: number;
  published: number;
  institution: string;
}

export interface ComponentStatus {
  database: boolean;
  vector_service: boolean;
  ipfs: boolean;
  solana: boolean;
  fee_payer: string;
}

// ---------- api ----------

export const api = {
  login: (email: string, displayName?: string) =>
    postJson<{ token: string; user: User }>('/api/auth/login', {
      email,
      display_name: displayName,
    }),

  me: () => request<User>('/api/auth/me'),

  listUsers: () => request<User[]>('/api/users'),

  listPapers: (params: { q?: string; discipline?: string; status?: string; mine?: boolean } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.discipline) search.set('discipline', params.discipline);
    if (params.status) search.set('status', params.status);
    if (params.mine) search.set('mine', 'true');
    const qs = search.toString();
    return request<Paper[]>(`/api/submissions${qs ? `?${qs}` : ''}`);
  },

  getPaper: (id: string) => request<PaperDetail>(`/api/submissions/${id}`),

  deposit: (file: File, fields: Record<string, string>): Promise<DepositResult> => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(fields).forEach(([key, value]) => value && formData.append(key, value));
    return request<DepositResult>('/api/submissions', { method: 'POST', body: formData });
  },

  depositRevision: (submissionId: string, file: File): Promise<DepositResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return request<DepositResult>(`/api/submissions/${submissionId}/versions`, {
      method: 'POST',
      body: formData,
    });
  },

  verifyHash: (hash: string) => request<VerifyResult>(`/api/verify?hash=${encodeURIComponent(hash)}`),

  plagiarismCheck: (file: File): Promise<PlagiarismResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return request<PlagiarismResult>('/api/plagiarism-check', { method: 'POST', body: formData });
  },

  search: (q: string, k = 10) =>
    request<{ mode: string; results: Paper[] }>(`/api/search?q=${encodeURIComponent(q)}&k=${k}`),

  matchReviewers: (submissionId: string) =>
    request<{ candidates: ReviewerCandidate[] }>(
      `/api/reviewers/match?submission_id=${encodeURIComponent(submissionId)}`,
    ),

  assignReviewer: (versionId: string, reviewerId: string) =>
    postJson<{ assignment_id: string; anchor: Anchor }>('/api/assignments', {
      version_id: versionId,
      reviewer_id: reviewerId,
    }),

  myAssignments: () => request<Assignment[]>('/api/assignments/mine'),

  submitReview: (assignmentId: string, text: string, recommendation: string) =>
    postJson<{ review_id: string; review_hash: string; anchor: Anchor }>('/api/reviews', {
      assignment_id: assignmentId,
      text,
      recommendation,
    }),

  publish: (versionId: string) =>
    postJson<{ status: string; anchor: Anchor }>(`/api/versions/${versionId}/publish`, {}),

  retract: (versionId: string, reason: string) =>
    postJson<{ status: string; anchor: Anchor }>(`/api/versions/${versionId}/retract`, { reason }),

  similarityReport: (versionId: string) =>
    request<SimilaritySummary & { report: SimilarityReport }>(`/api/similarity/${versionId}`),

  rebuildIndex: () => postJson<{ papers: number; chunks: number }>('/api/admin/rebuild-index', {}),

  stats: () => request<Stats>('/api/stats'),

  status: () => request<ComponentStatus>('/api/status'),
};

export const hashFileSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const gatewayLink = (paper: { gateway_url?: string; cid: string }) =>
  `${paper.gateway_url || 'https://ipfs.io'}/ipfs/${paper.cid}`;
