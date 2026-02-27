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
}

interface UploadResponse {
  status: string;
  metadata: { title?: string };
  file_record: { file_hash: string; file_cid: string };
  solana_signature: string;
  uploader_wallet: string;
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
    };
  });

export const api = {
  getAllMetadata: async (): Promise<ArchiveRecord[]> => {
    const rows = await fetchJson<string[][]>('/metadata');
    return normalizeMetadataRows(rows);
  },

  uploadFile: async (file: File, walletAddress: string): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('wallet_address', walletAddress);
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed (${response.status}): ${response.statusText}`);
    }

    return response.json();
  },

  verifyFileHash: async (hash: string): Promise<IntegrityCheckResult> =>
    fetchJson<IntegrityCheckResult>(`/integrity/check?hash=${encodeURIComponent(hash)}`),

  registerDownload: async (recordId: number, downloaderWallet: string): Promise<DownloadFeePlan> =>
    fetchJson<DownloadFeePlan>('/download/settle-fee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record_id: recordId, downloader_wallet: downloaderWallet }),
    }),
};
