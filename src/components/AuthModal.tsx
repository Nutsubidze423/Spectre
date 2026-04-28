import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

type Tab = 'login' | 'register';

interface Props {
  onSuccess: () => void;
}

export function AuthModal({ onSuccess }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setSession = useAuthStore((s) => s.setSession);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body: Record<string, string> = { email, password };
      if (tab === 'register') body.username = username;

      const res = await fetch(`${SERVER_URL}/api/auth/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        accessToken?: string;
        user?: { id: string; email: string; username: string };
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      setSession(data.user!, data.accessToken!);
      onSuccess();
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <motion.div
        className="auth-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-logo">
          <span className="auth-logo-icon">◈</span>
          <span className="auth-logo-text">Specter</span>
        </div>

        <div className="auth-tabs">
          {(['login', 'register'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`auth-tab${tab === t ? ' auth-tab--active' : ''}`}
              onClick={() => { setTab(t); setError(''); }}
            >
              {t === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={submit}>
          <AnimatePresence mode="wait">
            {tab === 'register' && (
              <motion.div
                key="username"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="auth-field">
                  <label className="auth-label">Username</label>
                  <input
                    className="auth-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your_handle"
                    autoComplete="username"
                    required
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && (
            <motion.p
              className="auth-error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {error}
            </motion.p>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="auth-spinner" />
            ) : (
              tab === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
