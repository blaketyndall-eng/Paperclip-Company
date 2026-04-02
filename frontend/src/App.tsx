import { AuthProvider, useAuth } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';

function RootApp() {
  const { status, user, logoutUser, can } = useAuth();

  if (window.location.pathname.startsWith('/oauth/callback')) {
    return <OAuthCallbackPage />;
  }

  if (status === 'loading') {
    return (
      <main>
        <h1>Paperclip Company</h1>
        <p>Loading session...</p>
      </main>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <LoginPage />;
  }

  return <DashboardPage user={user} can={can} onLogout={logoutUser} />;
}

export default function App() {
  return (
    <AuthProvider>
      <RootApp />
    </AuthProvider>
  );
}
