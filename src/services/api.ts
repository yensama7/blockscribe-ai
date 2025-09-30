const API_BASE_URL = "http://127.0.0.1:5000";

console.log('API Base URL:', API_BASE_URL);

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
    console.log('API Call: GET /metadata');
    try {
      const response = await fetch(`${API_BASE_URL}/metadata`);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Metadata response:', data);
      return data;
    } catch (error) {
      console.error('getAllMetadata error:', error);
      throw error;
    }
  },

  // Get metadata by ID
  getMetadataById: async (id: number): Promise<ArchiveRecord> => {
    console.log('API Call: GET /metadata/' + id);
    try {
      const response = await fetch(`${API_BASE_URL}/metadata/${id}`);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to fetch metadata by ID: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Metadata by ID response:', data);
      return data;
    } catch (error) {
      console.error('getMetadataById error:', error);
      throw error;
    }
  },

  // Search by field
  searchByField: async (field: string, query: string): Promise<ArchiveRecord[]> => {
    const url = `${API_BASE_URL}/search?field=${field}&q=${encodeURIComponent(query)}`;
    console.log('API Call: GET', url);
    try {
      const response = await fetch(url);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to search: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Search response:', data);
      return data;
    } catch (error) {
      console.error('searchByField error:', error);
      throw error;
    }
  },

  // Get difficulty analytics
  getDifficultyAnalytics: async (): Promise<any> => {
    console.log('API Call: GET /analytics/difficulty');
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/difficulty`);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to fetch difficulty analytics: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Difficulty analytics response:', data);
      return data;
    } catch (error) {
      console.error('getDifficultyAnalytics error:', error);
      throw error;
    }
  },

  // Get genre analytics
  getGenreAnalytics: async (): Promise<any> => {
    console.log('API Call: GET /analytics/genre');
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/genre`);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to fetch genre analytics: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Genre analytics response:', data);
      return data;
    } catch (error) {
      console.error('getGenreAnalytics error:', error);
      throw error;
    }
  },

  // Get clusters
  getClusters: async (n: number = 3): Promise<any> => {
    console.log('API Call: GET /analytics/clusters?n=' + n);
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/clusters?n=${n}`);
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to fetch clusters: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Clusters response:', data);
      return data;
    } catch (error) {
      console.error('getClusters error:', error);
      throw error;
    }
  },

  // AI search
  aiSearch: async (query: string, k: number = 3): Promise<SearchResult> => {
    console.log('API Call: POST /ai-search', { query, k });
    try {
      const response = await fetch(`${API_BASE_URL}/ai-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, k }),
      });
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to perform AI search: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('AI search response:', data);
      return data;
    } catch (error) {
      console.error('aiSearch error:', error);
      throw error;
    }
  },

  // Upload file
  uploadFile: async (file: File): Promise<any> => {
    console.log('API Call: POST /api/upload', { fileName: file.name, fileSize: file.size });
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);
      const data = await response.json();
      console.log('Upload response:', data);
      return data;
    } catch (error) {
      console.error('uploadFile error:', error);
      throw error;
    }
  },
};
