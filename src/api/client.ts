import { useAuthStore } from '../store/authStore';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

interface FetchOptions extends RequestInit {
  _retry?: boolean;
}

export async function apiFetch(path: string, options: FetchOptions = {}): Promise<Response> {
  const { _retry, ...init } = options;

  const accessToken = useAuthStore.getState().accessToken;

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !_retry) {
    // Attempt silent token refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch(path, { ...options, _retry: true });
    }
    useAuthStore.getState().logout();
  }

  return res;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { accessToken: string; user: { id: string; email: string; username: string } };
    useAuthStore.getState().setSession(data.user, data.accessToken);
    return true;
  } catch {
    return false;
  }
}
