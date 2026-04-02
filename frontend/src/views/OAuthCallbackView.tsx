"use client";

import React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';

export function OAuthCallbackView() {
  const { completeOAuthCallback } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');

    if (!code) {
      setError('Missing OAuth code in callback URL');
      return;
    }

    completeOAuthCallback(code)
      .then(() => {
        router.replace('/');
      })
      .catch((callbackError) => {
        setError(callbackError instanceof Error ? callbackError.message : 'OAuth callback failed');
      });
  }, [completeOAuthCallback, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-6">
      <Card title="Completing sign-in">
        {error ? <p role="alert">{error}</p> : <p>Finalizing your secure session...</p>}
      </Card>
    </main>
  );
}
