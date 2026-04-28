import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/client';
import type { JwtPayload } from '../types/index';

const router = Router();

// ─── Rate limits ──────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again in 15 minutes' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registrations from this IP — try again in an hour' },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const COOKIE_NAME = 'specter_refresh';
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signAccess(userId: string, email: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign({ userId, email } satisfies JwtPayload, secret, { expiresIn: ACCESS_EXPIRY });
}

function signRefresh(userId: string): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');
  return jwt.sign({ userId }, secret, { expiresIn: REFRESH_EXPIRY });
}

function setRefreshCookie(res: import('express').Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_EXPIRY_MS,
    path: '/api/auth',
  });
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, username, password } = req.body as Record<string, unknown>;

    if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    if (typeof username !== 'string' || username.length < 2 || username.length > 30) {
      res.status(400).json({ error: 'Username must be 2–30 characters' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      res.status(400).json({ error: 'Username may only contain letters, numbers, _ or -' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be 8–128 characters' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email: email.toLowerCase().trim(), username: username.trim(), passwordHash },
      select: { id: true, email: true, username: true },
    });

    const accessToken = signAccess(user.id, user.email);
    const refreshToken = signRefresh(user.id);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({ accessToken, user: { id: user.id, email: user.email, username: user.username } });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      res.status(409).json({ error: 'Email or username already taken' });
      return;
    }
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body as Record<string, unknown>;

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'email and password required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, username: true, passwordHash: true },
    });

    // Constant-time compare even if user not found
    const hash = user?.passwordHash ?? '$2b$12$invalidhashpaddingtoconstanttime';
    const match = await bcrypt.compare(password, hash);

    if (!user || !match) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const accessToken = signAccess(user.id, user.email);
    const refreshToken = signRefresh(user.id);
    setRefreshCookie(res, refreshToken);

    res.json({ accessToken, user: { id: user.id, email: user.email, username: user.username } });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

    const payload = jwt.verify(token, secret) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, username: true },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const accessToken = signAccess(user.id, user.email);
    const refreshToken = signRefresh(user.id);
    setRefreshCookie(res, refreshToken);

    res.json({ accessToken, user: { id: user.id, email: user.email, username: user.username } });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/api/auth' });
  res.json({ ok: true });
});

export default router;
