"use client";

import React from 'react';
import { useState } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';

export function LoginView() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | undefined>(undefined);

  async function onLoginClick(): Promise<void> {
    setError(undefined);
    try {
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to start OAuth login');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-4xl font-semibold tracking-tight">Paperclip Company</h1>
        <Card title="Sign in">
          <p className="text-slate-700">Use your Google account to access workflows and approvals.</p>
          <button
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500"
            type="button"
            onClick={onLoginClick}
          >
            Continue with Google
          </button>
          {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
        </Card>
      </div>
    </main>
  );
}
