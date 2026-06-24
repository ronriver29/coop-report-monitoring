import React, { useState } from 'react';
import { ShieldAlert, Fingerprint, Mail, Lock, Loader2, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiRequest } from '../lib/api.ts';

interface Props {
  onLoginSuccess: (token: string, user: any) => void;
}

export default function Login({ onLoginSuccess }: Props) {
  const [useEmail, setUseEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(new URLSearchParams(window.location.search).get('expired') === 'true');

  const handleAuthentikLogin = async () => {
    setShowExpired(false);
    try {
      const response = await apiRequest('/api/auth/authentik/url');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to get auth URL');
      }
      
      const { url } = data;

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        url,
        'cda_auth_popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Failed to initialize Authentik Login.');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Server Response Error (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex">
      {/* Visual Side */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-sidebar p-16 text-white overflow-hidden relative">
        <div className="z-10">
          <div className="flex items-center gap-4 mb-16">
            <img 
              src="https://cda.gov.ph/wp-content/uploads/2021/01/CDA-logo-RA11364-PNG.png" 
              alt="CDA Logo" 
              className="w-12 h-12 object-contain"
            />
            <span className="font-bold text-sm uppercase tracking-[0.3em] opacity-80 font-mono">Supervision & Examaintaion Division</span>
          </div>
          
          <h1 className="text-[48px] md:text-[72px] font-bold leading-[0.85] uppercase tracking-[-0.06em] mb-10 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/30 drop-shadow-2xl selection:bg-accent/30">
            Cooperative<br />
            Report<br />
            Monitoring
          </h1>
          
          <p className="max-w-md text-sm text-slate-400 leading-relaxed font-medium">
            Authorized multi-user platform for the Cooperative Development Authority to manage, ingest, and monitor regulatory reports with high-fidelity analytics.
          </p>
        </div>

        <div className="z-10 flex gap-10 text-[10px] uppercase tracking-widest font-bold text-slate-500">
           <div className="flex items-center gap-2 truncate"><span className="w-1.5 h-1.5 rounded-full bg-accent"></span> Unified Authentication</div>
           <div className="flex items-center gap-2 truncate"><span className="w-1.5 h-1.5 rounded-full bg-accent"></span> MongoDB Atlas</div>
           <div className="flex items-center gap-2 truncate"><span className="w-1.5 h-1.5 rounded-full bg-accent"></span> Audit Logging</div>
        </div>

        {/* Decorative Grid */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Form Side */}
      <div className="w-full lg:w-1/2 bg-bg flex items-center justify-center p-8">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-md w-full"
        >
          <div className="bg-header border border-border p-12 rounded-xl shadow-xl">
            <h2 className="text-2xl font-bold text-text-main mb-1">Access Gateway</h2>
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-10">Verification Required</p>

            {showExpired && (
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg mb-8 flex gap-3">
                <Clock className="text-orange-600 shrink-0" size={18} />
                <p className="text-[11px] font-bold uppercase text-orange-800">Your session has expired. Please log in again to continue.</p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {!useEmail ? (
                <motion.div
                  key="sso-login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <button
                    onClick={handleAuthentikLogin}
                    className="w-full bg-[#fd4b2d] text-white py-4 rounded-lg font-bold text-sm tracking-wide hover:opacity-90 transition-opacity flex items-center justify-center gap-3 shadow-lg shadow-[#fd4b2d]/20"
                  >
                    <Fingerprint size={20} />
                    Authentik SSO
                  </button>

                  <div className="relative flex items-center py-4">
                    <div className="flex-grow border-t border-border"></div>
                    <span className="flex-shrink mx-4 text-[10px] font-mono text-text-muted uppercase">OR</span>
                    <div className="flex-grow border-t border-border"></div>
                  </div>

                  <button
                    onClick={() => {
                      setUseEmail(true);
                      setShowExpired(false);
                    }}
                    className="w-full border border-border text-text-main py-4 rounded-lg font-bold text-sm tracking-wide hover:bg-bg transition-colors flex items-center justify-center gap-3"
                  >
                    <Mail size={18} />
                    Credential Sign-in
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="email-login"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleEmailLogin}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-[10px] font-bold text-text-muted uppercase mb-1 whitespace-nowrap">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setShowExpired(false);
                        }}
                        className="w-full pl-10 pr-4 py-3 bg-bg border border-border rounded-lg outline-none focus:border-accent transition-colors"
                        placeholder="name@cda.gov.ph"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-text-muted uppercase whitespace-nowrap">Password</label>
                      <span className="text-[10px] text-slate-500">Hint: admin123</span>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-bg border border-border rounded-lg outline-none focus:border-accent transition-colors"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="text-[11px] text-red-700 font-medium bg-red-50 p-3 rounded-lg border border-red-200 flex items-start gap-2 shadow-sm">
                      <ShieldAlert size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-accent text-white py-4 rounded-lg font-bold text-sm tracking-wide hover:opacity-90 transition-opacity flex items-center justify-center gap-3 shadow-lg shadow-accent/20"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : 'Authorize Access'}
                    <ArrowRight size={18} />
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setUseEmail(false)}
                    className="w-full text-[11px] font-bold text-accent uppercase tracking-wider py-2 mt-4"
                  >
                    Back to SSO
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="mt-12 pt-8 border-t border-border flex flex-col items-center gap-4">
               <div className="flex gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-warning"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
               </div>
               <p className="text-center text-[10px] font-medium text-text-muted leading-relaxed max-w-[280px]">
                 By entering, you confirm authorization to access sensitive internal monitoring data of the Authority.
               </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
