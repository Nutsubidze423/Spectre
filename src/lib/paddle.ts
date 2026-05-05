import { initializePaddle } from '@paddle/paddle-js';
import type { Paddle } from '@paddle/paddle-js';

let _paddle: Paddle | undefined;

export function getPaddle(): Paddle | undefined {
  return _paddle;
}

export async function initPaddle(): Promise<void> {
  if (_paddle) return;
  const token = (import.meta as { env: Record<string, string> }).env.VITE_PADDLE_CLIENT_TOKEN;
  if (!token) {
    console.warn('[paddle] VITE_PADDLE_CLIENT_TOKEN not set — checkout unavailable');
    return;
  }
  const environment = (import.meta as { env: Record<string, string> }).env.VITE_PADDLE_ENV === 'production'
    ? 'production'
    : 'sandbox';
  const p = await initializePaddle({ environment, token });
  if (p) _paddle = p;
}
