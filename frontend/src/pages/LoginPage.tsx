import { useState } from 'react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
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
    <main>
      <h1>Paperclip Company</h1>
      <Card title="Sign in">
        <p>Use your Google account to access workflows and approvals.</p>
        <button type="button" onClick={onLoginClick}>
          Continue with Google
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </Card>
    </main>
  );
}
