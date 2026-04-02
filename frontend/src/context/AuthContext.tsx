"use client";

import React from 'react';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import {
  AuthSessionPayload,
  AuthUser,
  exchangeGoogleCode,
  getGoogleAuthorizationUrl,
  logout,
  refreshAuth
} from '../services/auth-api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user?: AuthUser;
  token?: string;
  signInWithGoogle: () => Promise<void>;
  completeOAuthCallback: (code: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  can: (roles: string[]) => boolean;
}

const SESSION_STORAGE_KEY = 'paperclip-session';

interface StoredSession {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): StoredSession | undefined {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.refreshToken || !parsed.user) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function persistSession(payload: AuthSessionPayload): void {
  const stored: StoredSession = {
    token: payload.token,
    refreshToken: payload.refreshToken,
    user: payload.user
  };
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
}

function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | undefined>(undefined);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | undefined>(undefined);

  function applySession(payload: AuthSessionPayload): void {
    persistSession(payload);
    setUser(payload.user);
    setToken(payload.token);
    setRefreshTokenValue(payload.refreshToken);
    setStatus('authenticated');
  }

  useEffect(() => {
    const stored = readStoredSession();

    if (!stored) {
      setStatus('unauthenticated');
      return;
    }

    setUser(stored.user);
    setToken(stored.token);
    setRefreshTokenValue(stored.refreshToken);
    setStatus('authenticated');

    refreshAuth(stored.refreshToken)
      .then((payload) => {
        applySession(payload);
      })
      .catch(() => {
        clearStoredSession();
        setUser(undefined);
        setToken(undefined);
        setRefreshTokenValue(undefined);
        setStatus('unauthenticated');
      });
  }, []);

  async function signInWithGoogle(): Promise<void> {
    const url = await getGoogleAuthorizationUrl();
    window.location.href = url;
  }

  async function completeOAuthCallback(code: string): Promise<void> {
    const payload = await exchangeGoogleCode(code);
    applySession(payload);
  }

  async function logoutUser(): Promise<void> {
    const currentRefresh = refreshTokenValue;
    clearStoredSession();
    setStatus('unauthenticated');
    setUser(undefined);
    setToken(undefined);
    setRefreshTokenValue(undefined);

    if (currentRefresh) {
      await logout(currentRefresh);
    }
  }

  function can(requiredRoles: string[]): boolean {
    if (!user) {
      return false;
    }

    return requiredRoles.some((role) => user.roles.includes(role));
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      signInWithGoogle,
      completeOAuthCallback,
      logoutUser,
      can
    }),
    [status, user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return value;
}
