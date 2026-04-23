const API_BASE_URL = 'http://127.0.0.1:5000';

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

export interface UploadPrepareResponse {
  upload_id: string;
  metadata: { title?: string; difficulty?: string; genre?: string; summary?: string };
  file_record: { file_hash: string; file_cid: string };
  memo_text: string;
}

export interface IntegrityCheckResult {
  exists: boolean;
  matches_on_chain: boolean;
  record?: ArchiveRecord;
}

export interface DownloadFeePlan {
  record_id: number;
  access_type: string;
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
  const response = await fetch(`${API_BASE_URL}${path}`, init);
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

  getLibraryHighlights: async (): Promise<LibraryHighlights> => fetchJson<LibraryHighlights>('/library/highlights'),

  searchByTitle: async (query: string): Promise<ArchiveRecord[]> =>
    fetchJson<ArchiveRecord[]>(`/search?field=title&q=${encodeURIComponent(query)}`),

  prepareUpload: async (
    file: File,
    accessType: 'open' | 'restricted',
    publishFeeLamports: number,
  ): Promise<UploadPrepareResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('access_type', accessType);
    formData.append('publish_fee_lamports', String(publishFeeLamports));

    const response = await fetch(`${API_BASE_URL}/api/upload/prepare`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload prepare failed (${response.status}): ${response.statusText}`);
    }

    return response.json();
  },

  confirmUpload: async (uploadId: string, walletAddress: string, txSignature: string): Promise<void> => {
    await fetchJson('/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId, wallet_address: walletAddress, tx_signature: txSignature }),
    });
  },

  verifyFileHash: async (hash: string): Promise<IntegrityCheckResult> =>
    fetchJson<IntegrityCheckResult>(`/integrity/check?hash=${encodeURIComponent(hash)}`),

  getDownloadQuote: async (recordId: number, downloaderWallet: string): Promise<DownloadFeePlan> =>
    fetchJson<DownloadFeePlan>('/download/settle-fee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_id: recordId, downloader_wallet: downloaderWallet }),
    }),

  verifyDownloadAndServe: async (recordId: number, downloaderWallet: string, txSignature: string): Promise<{ download_url: string }> =>
    fetchJson<{ download_url: string }>('/download/verify-and-serve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_id: recordId, downloader_wallet: downloaderWallet, tx_signature: txSignature }),
    }),
};
