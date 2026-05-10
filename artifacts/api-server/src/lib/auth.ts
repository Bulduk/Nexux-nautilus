import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { type Request, type Response } from "express";

// ── Constants ──────────────────────────────────────────────────────────────
export const ACCESS_TOKEN_COOKIE  = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const ACCESS_TOKEN_TTL_SEC  = 15 * 60;          // 15 min
export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 3600;    // 7 days

// ── JWT helpers ────────────────────────────────────────────────────────────
function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET env var is not set");
  return s;
}

export interface JwtPayload {
  sub: string;   // user.id
  email: string;
  role: string;
  plan: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: ACCESS_TOKEN_TTL_SEC });
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, jwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

// ── Refresh token helpers ──────────────────────────────────────────────────
/** Generates a random opaque refresh token and its SHA-256 hash for DB storage. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("hex");
  const hash  = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── Cookie helpers ─────────────────────────────────────────────────────────
export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SEC * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/refresh",
    maxAge: REFRESH_TOKEN_TTL_SEC * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/auth/refresh" });
}

export function getAccessToken(req: Request): string | null {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

export function getRefreshToken(req: Request): string | null {
  return req.cookies?.[REFRESH_TOKEN_COOKIE] ?? null;
}
