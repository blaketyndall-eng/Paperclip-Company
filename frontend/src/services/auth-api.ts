"use client";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface AuthSessionPayload {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getGoogleAuthorizationUrl(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/auth/google`);
  const data = await parseJson<{ authorizationUrl: string }>(response);
  return data.authorizationUrl;
}

export async function exchangeGoogleCode(code: string): Promise<AuthSessionPayload> {
  const response = await fetch(`${apiBaseUrl}/auth/google/callback?code=${encodeURIComponent(code)}`);
  return parseJson<AuthSessionPayload>(response);
}

export async function refreshAuth(refreshToken: string): Promise<AuthSessionPayload> {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  return parseJson<AuthSessionPayload>(response);
}

export async function logout(refreshToken: string): Promise<void> {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });
}
