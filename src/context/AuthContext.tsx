import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, getAuthToken, setAuthToken, User } from '@/services/api';

// Institutional email login. A Solana wallet exists for every account, but it
// is generated and custodied server-side — nobody has to install anything
// (restructure.md §4).

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isEditor: boolean;
  login: (email: string, displayName?: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getAuthToken()));

  useEffect(() => {
    if (!getAuthToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, displayName?: string) => {
    const { token, user: loggedIn } = await api.login(email, displayName);
    setAuthToken(token);
    setUser(loggedIn);
    return loggedIn;
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isEditor: user?.role === 'editor', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
