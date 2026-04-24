const API_BASE_URL = 'http://127.0.0.1:5000';
const REQUEST_TIMEOUT_MS = 60_000;

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};

export interface ArchiveRecord {
  id: number;
  genre: string;
  title: string;
  difficulty: string;
  summary: string;
  file_hash: string;
  file_cid: string;
  uploader_wallet?: string;
  solana_signature?: string;
  access_type?: string;
  publish_fee_lamports?: number;
  search_count?: number;
  created_at?: string;
}

export interface UploadResponse {
  status: string;
  metadata: { title?: string; difficulty?: string; genre?: string; summary?: string };
  file_record: { file_hash: string; file_cid: string };
  memo_message?: string;
  solana_signature?: string;
  uploader_wallet?: string;
  access_type?: string;
  publish_fee_lamports?: number;
}

export interface IntegrityCheckResult {
  exists: boolean;
  matches_on_chain: boolean;
  record?: ArchiveRecord;
}

export interface DownloadFeePlan {
  settled: boolean;
  amount_lamports_total: number;
  amount_lamports_uploader: number;
  amount_lamports_developer: number;
  uploader_wallet?: string;
  developer_wallet: string;
}

export interface LibraryHighlights {
  top_searched: ArchiveRecord[];
  recent: ArchiveRecord[];
  random: ArchiveRecord[];
}

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

const normalizeMetadataRows = (rows: string[][]): ArchiveRecord[] =>
  rows.map((row) => {
    const [fileHash = '', fileCid = ''] = (row[5] || '').split('|');

    return {
      id: Number(row[0]),
      genre: row[1] || 'Unknown',
      title: row[2] || 'Untitled',
      difficulty: row[3] || 'Unknown',
      summary: row[4] || '',
      file_hash: fileHash,
      file_cid: fileCid,
      uploader_wallet: row[6] || undefined,
      solana_signature: row[7] || undefined,
      access_type: row[8] || 'open',
      publish_fee_lamports: Number(row[9] || 1000),
      search_count: Number(row[10] || 0),
      created_at: row[11] || undefined,
    };
  });

export const api = {
  getAllMetadata: async (): Promise<ArchiveRecord[]> => {
    const rows = await fetchJson<string[][]>('/metadata');
    return normalizeMetadataRows(rows);
  },

  getMetadataByWallet: async (walletAddress: string): Promise<ArchiveRecord[]> => {
    const rows = await fetchJson<string[][]>(`/metadata/by-wallet?wallet=${encodeURIComponent(walletAddress)}`);
    return normalizeMetadataRows(rows);
  },

  getLibraryHighlights: async (): Promise<LibraryHighlights> => fetchJson<LibraryHighlights>('/library/highlights'),

  searchByTitle: async (query: string): Promise<ArchiveRecord[]> =>
    fetchJson<ArchiveRecord[]>(`/search?field=title&q=${encodeURIComponent(query)}`),

  uploadFile: async (file: File, walletAddress: string): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('wallet_address', walletAddress);
    formData.append('file', file);

    const response = await fetchWithTimeout(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status}): ${response.statusText}`);
    }

    return response.json();
  },

  confirmUploadSignature: async (
    fileHash: string,
    solanaSignature: string,
    uploaderWallet: string,
  ): Promise<{ status: string }> =>
    fetchJson<{ status: string }>('/api/upload/confirm-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_hash: fileHash,
        solana_signature: solanaSignature,
        uploader_wallet: uploaderWallet,
      }),
    }),

  verifyFileHash: async (hash: string): Promise<IntegrityCheckResult> =>
    fetchJson<IntegrityCheckResult>(`/integrity/check?hash=${encodeURIComponent(hash)}`),

  registerDownload: async (recordId: number, downloaderWallet: string): Promise<DownloadFeePlan> =>
    fetchJson<DownloadFeePlan>('/download/settle-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_id: recordId, downloader_wallet: downloaderWallet }),
    }),

};
