import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types.ts';
import Dashboard from './components/Dashboard.tsx';
import Login from './components/Login.tsx';
import LoadingPage from './components/LoadingPage.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest } from './lib/api.ts';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('cda_token'));
  const [loading, setLoading] = useState(true);
  const [isRouting, setIsRouting] = useState(false);

  useEffect(() => {
    // Check for token in URL (after redirect)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const isExpiredInUrl = params.get('expired') === 'true';
    
    if (urlToken || isExpiredInUrl) {
      if (urlToken) {
        localStorage.setItem('cda_token', urlToken);
        setToken(urlToken);
      }
      
      // Clean URL after a short delay so children (Login) can read initial state
      setTimeout(() => {
        const base = import.meta.env.BASE_URL || '/';
        const cleanUrl = window.location.pathname === base || window.location.pathname === '/' 
          ? base 
          : window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }, 500);
    }
    
    // Handle message from popup
    const handleMessage = (event: MessageEvent) => {
      // Validate origin is from AI Studio preview, localhost, or GitHub Pages
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.endsWith('github.io')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { token: popupToken, user: popupUser } = event.data;
        handleLoginSuccess(popupToken, popupUser);
      }
    };

    window.addEventListener('message', handleMessage);
    
    const initializeUser = async () => {
      if (!token) return;
      
      const savedUser = localStorage.getItem('cda_user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        // Fetch from server if we have token but no user
        try {
          const res = await apiRequest('/api/auth/me');
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            localStorage.setItem('cda_user', JSON.stringify(data.user));
          } else if (res.status === 401) {
            // Token invalid or expired
            handleLogout();
          }
        } catch (err: any) {
          if (err && !err.isNetworkError) {
            console.error('Failed to fetch user profile:', err);
          }
        }
      }
    };

    initializeUser();
    
    // Simulate real splash screen time
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3500);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('cda_user', JSON.stringify(user));
    }
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('cda_token');
    localStorage.removeItem('cda_user');
    setToken(null);
    setUser(null);
  };

  const handleLoginSuccess = (newToken: string, newUser: any) => {
    setIsRouting(true);
    
    // Smooth transition to dashboard
    setTimeout(() => {
      localStorage.setItem('cda_token', newToken);
      localStorage.setItem('cda_user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
      
      // Keep loading briefly after setting state for smooth entrance
      setTimeout(() => {
        setIsRouting(false);
      }, 2500);
    }, 800);
  };

  if (loading || isRouting || (token && !user)) return <LoadingPage />;

  return (
    <div className="min-h-screen bg-bg text-text-main font-sans flex flex-col">
      <AnimatePresence mode="wait">
        {(!token || !user) ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Login onLoginSuccess={handleLoginSuccess} />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-screen w-screen"
          >
            <Dashboard user={user} token={token} onLogout={handleLogout} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
