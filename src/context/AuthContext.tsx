import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import axios from "axios";
import api from "../api/axios";
import { clearEntryDrafts } from "../lib/entryDrafts";
import { saveActiveCompany, storedActiveCompany, withActiveCompany } from "../lib/activeCompany";

const baseUrl = import.meta.env.VITE_API_URL;

interface AuthContextType {
  token: string | null;
  role: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<string>;
  /** Signs in with a one-time code sent by email (POST /auth/login-otp/verify). */
  loginWithCode: (email: string, code: string) => Promise<string>;
  logout: () => void;
  user: any;
  loading: boolean;
  /** M6: the company chosen in the account menu (people with sites at several clients); else null. */
  activeCompanyId: number | null;
  setActiveCompany: (companyId: number) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  // M6: bumped when the account menu's company changes, so the shown user follows it.
  const [companyPick, setCompanyPick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- companyPick re-reads the stored choice
  const activeCompanyId = useMemo(() => storedActiveCompany(user), [user, companyPick]);
  const shownUser = useMemo(() => withActiveCompany(user, activeCompanyId), [user, activeCompanyId]);
  const setActiveCompany = (companyId: number) => {
    saveActiveCompany(user, companyId);
    setCompanyPick((n) => n + 1);
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    console.log("AuthProvider: Initial Load", { token });
    if (token) setToken(token);
    setLoading(false);
  }, []);


  // 🔄 Restore session ONCE
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const storedUser = localStorage.getItem("user");


    if (storedToken && storedRole && storedUser) {
      setToken(storedToken);
      setRole(storedRole);
      setUser(JSON.parse(storedUser)); // ✅ FIX

      // Refresh the session user from the server so site/category changes
      // (e.g. a newly assigned category) appear without forcing a re-login.
      api
        .get("/auth/me")
        .then((res) => {
          const fresh = res.data?.user;
          if (!fresh) return;
          localStorage.setItem("user", JSON.stringify(fresh));
          setUser(fresh);
          if (res.data?.role) {
            localStorage.setItem("role", res.data.role);
            setRole(res.data.role);
          }
        })
        .catch(() => {
          // Keep the cached user if the refresh fails (offline / token expiry).
        });
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${baseUrl}/auth/login`, {
      email,
      password,
    });
    return startSession(res.data);
  };

  const loginWithCode = async (email: string, code: string) => {
    const res = await axios.post(`${baseUrl}/auth/login-otp/verify`, { email, code });
    return startSession(res.data);
  };

  // Both sign-in endpoints answer { token, role, user }.
  const startSession = (data: { token: string; role: string; user: AuthContextType["user"] }) => {
    const { token, role, user } = data;

    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    localStorage.setItem("user", JSON.stringify(user));

    setToken(token);
    setRole(role);
    setUser(user);

    // First sign-in only: save the browser's timezone when none is set yet
    // (fire-and-forget). A timezone chosen in Settings or set by a Superadmin
    // is never overwritten by whichever device the person signs in from.
    if (!user?.timezone) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        api.put("/notifications/preferences", { timezone: tz }).catch(() => {});
      } catch {
        // Ignore — timezone detection is best-effort
      }
    }

    return role;
  };

  const logout = () => {
    localStorage.clear();
    clearEntryDrafts();
    setToken(null);
    setRole(null);
    setUser(null); // ✅ FIX
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        token,
        role,
        user: shownUser,
        activeCompanyId,
        setActiveCompany,
        isAuthenticated: !!token,
        login,
        loginWithCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
