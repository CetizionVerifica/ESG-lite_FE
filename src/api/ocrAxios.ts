import axios from "axios";

/**
 * The AI service (VITE_OCR_API_URL) requires the ESGLite sign-in token on
 * every /v1 call: the same token src/api/axios.ts sends to the API.
 */
export function ocrAuthHeaders(): Record<string, string> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("token");
  } catch {
    token = null;
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const ocrApi = axios.create({
  baseURL: import.meta.env.VITE_OCR_API_URL,
});

ocrApi.interceptors.request.use((config) => {
  const { Authorization } = ocrAuthHeaders();
  if (Authorization) {
    config.headers.Authorization = Authorization;
  }
  return config;
});

export default ocrApi;
