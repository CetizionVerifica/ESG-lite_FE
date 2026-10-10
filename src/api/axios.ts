import axios, { type AxiosError } from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const SIGN_IN_PATHS = ["/login", "/superadmin/login"];

let signingOut = false;

/** Lets tests start each case as if the page had just loaded. */
export function resetSessionExpiry(): void {
  signingOut = false;
}

/**
 * An authenticated request came back 401: the token expired or was revoked.
 * End the session the way logout does (clear stored session) and send the
 * person to their sign-in page. Runs once even when many requests 401 at once,
 * and never from a sign-in page or for the sign-in call itself.
 */
export function handleUnauthorized(error: AxiosError): void {
  if (error.response?.status !== 401 || signingOut) return;
  const url = error.config?.url ?? "";
  if (url.includes("/auth/login")) return;
  if (!error.config?.headers?.Authorization) return;
  const path = window.location.pathname;
  if (SIGN_IN_PATHS.some((p) => path === p || path.endsWith(p))) return;

  signingOut = true;
  let role: string | null = null;
  try {
    role = localStorage.getItem("role");
    localStorage.clear();
  } catch {
    // Storage blocked: the reload below still drops the in-memory session.
  }
  window.location.replace(role === "Superadmin" ? "/superadmin/login" : "/login");
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    handleUnauthorized(error);
    return Promise.reject(error);
  },
);

export default api;
