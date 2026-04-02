"use client";

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DashboardView } from './views/DashboardView';
import { LoginView } from './views/LoginView';

function RootApp() {
  const { status, user, logoutUser, can } = useAuth();

  if (status === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center p-6">
        <section className="w-full rounded-2xl border border-slate-300 bg-white/80 p-8 shadow-lg backdrop-blur">
          <h1 className="text-3xl font-semibold tracking-tight">Paperclip Company</h1>
          <p className="mt-3 text-slate-700">Loading session...</p>
        </section>
      </main>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <LoginView />;
  }

  return <DashboardView user={user} can={can} onLogout={logoutUser} />;
}

export default function App() {
  return (
    <AuthProvider>
      <RootApp />
    </AuthProvider>
  );
}
