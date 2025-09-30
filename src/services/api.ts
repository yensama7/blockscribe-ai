const API_BASE_URL = "http://127.0.0.1:5000";

export interface ArchiveRecord {
  id: number;
  genre: string;
  title: string;
  difficulty: string;
  summary: string;
  file_hash: string;
  file_cid: string;
}

export interface SearchResult {
  ids: string[][];
  documents: string[][];
  metadatas: any[][];
  distances: number[][];
}

export const api = {
  // Get all metadata
  getAllMetadata: async (): Promise<string[][]> => {
    const response = await fetch(`${API_BASE_URL}/metadata`);
    if (!response.ok) throw new Error("Failed to fetch metadata");
    return response.json();
  },

  // Get metadata by ID
  getMetadataById: async (id: number): Promise<ArchiveRecord> => {
    const response = await fetch(`${API_BASE_URL}/metadata/${id}`);
    if (!response.ok) throw new Error("Failed to fetch metadata by ID");
    return response.json();
  },

  // Search by field
  searchByField: async (field: string, query: string): Promise<ArchiveRecord[]> => {
    const response = await fetch(`${API_BASE_URL}/search?field=${field}&q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Failed to search");
    return response.json();
  },

  // Get difficulty analytics
  getDifficultyAnalytics: async (): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/analytics/difficulty`);
    if (!response.ok) throw new Error("Failed to fetch difficulty analytics");
    return response.json();
  },

  // Get genre analytics
  getGenreAnalytics: async (): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/analytics/genre`);
    if (!response.ok) throw new Error("Failed to fetch genre analytics");
    return response.json();
  },

  // Get clusters
  getClusters: async (n: number = 3): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/analytics/clusters?n=${n}`);
    if (!response.ok) throw new Error("Failed to fetch clusters");
    return response.json();
  },

  // AI search
  aiSearch: async (query: string, k: number = 3): Promise<SearchResult> => {
    const response = await fetch(`${API_BASE_URL}/ai-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, k }),
    });
    if (!response.ok) throw new Error("Failed to perform AI search");
    return response.json();
  },

  // Upload file
  uploadFile: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    
    const response = await fetch(`${API_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error("Failed to upload file");
    return response.json();
  },
};
