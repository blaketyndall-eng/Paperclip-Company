import { AuthProvider } from '../../../context/AuthContext';
import { OAuthCallbackView } from '../../../views/OAuthCallbackView';

export default function OAuthCallbackRoute() {
  return (
    <AuthProvider>
      <OAuthCallbackView />
    </AuthProvider>
  );
}
