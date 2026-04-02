import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';

export function OAuthCallbackPage() {
  const { completeOAuthCallback } = useAuth();
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
        window.history.replaceState({}, document.title, '/');
      })
      .catch((callbackError) => {
        setError(callbackError instanceof Error ? callbackError.message : 'OAuth callback failed');
      });
  }, [completeOAuthCallback]);

  return (
    <main>
      <Card title="Completing sign-in">
        {error ? <p role="alert">{error}</p> : <p>Finalizing your secure session...</p>}
      </Card>
    </main>
  );
}
