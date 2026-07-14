// ============================================================
// EthioPOS — Next.js 14 Production Frontend
// App Router · TailwindCSS · React Query · i18n · PWA/Offline
// ============================================================

// ─── next.config.ts ──────────────────────────────────────────
import type { NextConfig } from 'next';
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { domains: ['cdn.ethiopos.et'] },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
    NEXT_PUBLIC_APP_NAME: 'EthioPOS',
  },
  // Enable gzip + brotli compression
  compress: true,
  // Optimise bundle
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.ethiopos\.et\/api\/v1\/products/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'ethiopos-products',
        expiration: { maxAgeSeconds: 60 * 60 * 24 }, // 24h cache
      },
    },
    {
      urlPattern: /^https:\/\/api\.ethiopos\.et\/api\/v1\/branches/,
      handler: 'CacheFirst',
      options: { cacheName: 'ethiopos-branches', expiration: { maxAgeSeconds: 60 * 60 } },
    },
  ],
})(nextConfig);

// ─── src/lib/api-client.ts ───────────────────────────────────
import axios, { type AxiosError } from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage
api.interceptors.request.use(cfg => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ethiopos_token');
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// Auto-refresh on 401
api.interceptors.response.use(
  r => r,
  async (err: AxiosError) => {
    if (err.response?.status === 401) {
      const refresh = localStorage.getItem('ethiopos_refresh');
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
            { refresh_token: refresh },
          );
          localStorage.setItem('ethiopos_token', data.access_token);
          err.config!.headers!.Authorization = `Bearer ${data.access_token}`;
          return api.request(err.config!);
        } catch {
          localStorage.clear();
          window.location.href = '/auth/login';
        }
      }
    }
    return Promise.reject(err);
  },
);

// ─── src/lib/i18n.ts — 3-language support ───────────────────
export type Locale = 'en' | 'am' | 'om';

export const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  en: {
    // Navigation
    'nav.dashboard':  'Dashboard',
    'nav.pos':        'Point of Sale',
    'nav.inventory':  'Inventory',
    'nav.sales':      'Sales',
    'nav.finance':    'Finance',
    'nav.accounting': 'Accounting',
    'nav.hr':         'HR & Payroll',
    'nav.invoices':   'Invoices',
    'nav.warehouse':  'Warehouse',
    'nav.crm':        'CRM',
    'nav.employees':  'Employees',
    'nav.suppliers':  'Suppliers',
    'nav.reports':    'Reports',
    'nav.ai':         'AI Intelligence',
    'nav.security':   'Security',
    'nav.settings':   'Settings',
    // POS
    'pos.receipt':    'Receipt',
    'pos.charge':     'Charge',
    'pos.subtotal':   'Subtotal',
    'pos.vat':        'VAT (15%)',
    'pos.total':      'Total',
    'pos.noItems':    'No items added yet',
    // Common
    'common.save':    'Save',
    'common.cancel':  'Cancel',
    'common.search':  'Search...',
    'common.add':     'Add',
    'common.edit':    'Edit',
    'common.delete':  'Delete',
    'common.export':  'Export',
    'common.loading': 'Loading...',
    'common.error':   'An error occurred',
    'common.success': 'Success',
    'auth.login':     'Sign In',
    'auth.logout':    'Sign Out',
    'auth.pin':       'Enter PIN',
    'auth.role':      'Select Role',
  },
  am: {
    'nav.dashboard':  'ዳሽቦርድ',
    'nav.pos':        'ሽያጭ',
    'nav.inventory':  'እቃ ክምችት',
    'nav.sales':      'ሽያጮች',
    'nav.finance':    'ፋይናንስ',
    'nav.accounting': 'ሂሳብ አያያዝ',
    'nav.hr':         'ሠራተኞችና ደሞዝ',
    'nav.invoices':   'ደረሰኞች',
    'nav.warehouse':  'መጋዘን',
    'nav.crm':        'ደንበኞች',
    'nav.employees':  'ሠራተኞች',
    'nav.suppliers':  'አቅራቢዎች',
    'nav.reports':    'ሪፖርቶች',
    'nav.ai':         'AI ትንታኔ',
    'nav.security':   'ደህንነት',
    'nav.settings':   'ቅንብሮች',
    'pos.receipt':    'ደረሰኝ',
    'pos.charge':     'ክፍያ ስብሰብ',
    'pos.subtotal':   'ድምር',
    'pos.vat':        'ቫት (15%)',
    'pos.total':      'ጠቅላላ',
    'pos.noItems':    'ምንም ዕቃ አልተጨመረም',
    'common.save':    'አስቀምጥ',
    'common.cancel':  'ሰርዝ',
    'common.search':  'ፈልግ...',
    'common.add':     'ጨምር',
    'common.edit':    'አርትዕ',
    'common.delete':  'ሰርዝ',
    'common.export':  'ላክ',
    'common.loading': 'እየጫነ ነው...',
    'common.error':   'ስህተት ተፈጥሯል',
    'common.success': 'ተሳክቷል',
    'auth.login':     'ግባ',
    'auth.logout':    'ውጣ',
    'auth.pin':       'PIN ያስገቡ',
    'auth.role':      'ሚናዎን ይምረጡ',
  },
  om: {
    'nav.dashboard':  'Dasboordii',
    'nav.pos':        'Gabatee Gurgurtaa',
    'nav.inventory':  'Kuusaa Meeshaa',
    'nav.sales':      'Gurgurtaa',
    'nav.finance':    'Maallaqaa',
    'nav.accounting': 'Herregaa',
    'nav.hr':         'Hojjettootaa',
    'nav.invoices':   'Waraqaa Herregaa',
    'nav.warehouse':  'Kuusaa',
    'nav.crm':        'Maamiltoota',
    'nav.employees':  'Hojjettoota',
    'nav.suppliers':  'Dhiyeessitootaa',
    'nav.reports':    'Gabaasalee',
    'nav.ai':         'AI Xinxalaa',
    'nav.security':   'Nageenyaa',
    'nav.settings':   'Qindaa\'ina',
    'pos.receipt':    'Rasiidhii',
    'pos.charge':     'Kaffaltii Fudhuu',
    'pos.subtotal':   'Walii Galaa',
    'pos.vat':        'VAT (15%)',
    'pos.total':      'Walii Gala',
    'pos.noItems':    'Meeshaan hin dabalamin',
    'common.save':    'Kuusi',
    'common.cancel':  'Haqi',
    'common.search':  'Barbaadi...',
    'common.add':     'Dabali',
    'common.edit':    'Gulaali',
    'common.delete':  'Haqi',
    'common.export':  'Ergi',
    'common.loading': 'Fe\'amaa jira...',
    'common.error':   'Dogoggorri uumame',
    'common.success': 'Milkaa\'e',
    'auth.login':     'Seeni',
    'auth.logout':    'Ba\'i',
    'auth.pin':       'PIN galchi',
    'auth.role':      'Gahee filadhu',
  },
};

// React hook for translations
export function useT(locale: Locale) {
  return (key: string): string => TRANSLATIONS[locale]?.[key] ?? key;
}

// ─── src/lib/offline-queue.ts ────────────────────────────────
interface QueuedOperation { id: string; url: string; method: string; body: any; timestamp: number; retries: number; }

const QUEUE_KEY = 'ethiopos_offline_queue';

export const offlineQueue = {
  add(op: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>) {
    const queue = this.getAll();
    queue.push({ ...op, id: crypto.randomUUID(), timestamp: Date.now(), retries: 0 });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  getAll(): QueuedOperation[] {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]'); }
    catch { return []; }
  },

  async flush(): Promise<{ synced: number; failed: number }> {
    const queue = this.getAll();
    let synced = 0; let failed = 0;
    const remaining: QueuedOperation[] = [];

    for (const op of queue) {
      try {
        await api.request({ url: op.url, method: op.method, data: op.body });
        synced++;
      } catch {
        if (op.retries < 3) { remaining.push({ ...op, retries: op.retries + 1 }); failed++; }
        // Drop after 3 retries to avoid infinite accumulation
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { synced, failed };
  },

  count(): number { return this.getAll().length; },
  clear() { localStorage.removeItem(QUEUE_KEY); },
};

// ─── src/app/layout.tsx ──────────────────────────────────────
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title:       'EthioPOS — Ethiopian Business ERP',
  description: '21-module ERP platform for Ethiopian and African SMEs',
  manifest:    '/manifest.json',
  icons: [
    { rel: 'icon',             url: '/icons/icon-192.png' },
    { rel: 'apple-touch-icon', url: '/icons/icon-512.png' },
  ],
  openGraph: {
    title:       'EthioPOS ERP',
    description: 'POS · Inventory · Accounting · HR · AI for Ethiopian SMEs',
    url:         'https://ethiopos.et',
    siteName:    'EthioPOS',
    locale:      'en_ET',
    type:        'website',
  },
};

export const viewport: Viewport = {
  themeColor:     '#1E40AF',
  width:          'device-width',
  initialScale:   1,
  maximumScale:   1,
  userScalable:   false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

// ─── src/app/providers.tsx ───────────────────────────────────
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools }               from '@tanstack/react-query-devtools';
import { useState, type ReactNode }         from 'react';
import { Toaster }                          from 'sonner';
import { AuthProvider }                     from '@/context/auth-context';
import { ThemeProvider }                    from '@/context/theme-context';
import { LocaleProvider }                   from '@/context/locale-context';
import { OfflineBanner }                    from '@/components/ui/offline-banner';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries:   { staleTime: 5 * 60_000, retry: 2, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <LocaleProvider>
            <OfflineBanner />
            {children}
            <Toaster position="top-right" richColors closeButton />
          </LocaleProvider>
        </ThemeProvider>
      </AuthProvider>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}

// ─── src/context/auth-context.tsx ────────────────────────────
'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

interface User {
  id: string; tenantId: string; branchId: string;
  role: string; name: string;
}

interface AuthContextType {
  user:    User | null;
  token:   string | null;
  login:   (identifier: string, password: string) => Promise<{ mfaRequired?: boolean }>;
  loginPin:(userId: string, pin: string) => Promise<void>;
  verifyMfa:(token: string, otp: string) => Promise<void>;
  logout:  () => void;
  isLoading: boolean;
}

const AuthCtx = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem('ethiopos_token');
    const u = localStorage.getItem('ethiopos_user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
    setIsLoading(false);
  }, []);

  const login = async (identifier: string, password: string) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    if (data.mfa_required) return { mfaRequired: true, partialToken: data.partial_token };
    persistSession(data);
    return {};
  };

  const loginPin = async (userId: string, pin: string) => {
    const { data } = await api.post('/auth/login/pin', { userId, pin });
    persistSession(data);
  };

  const verifyMfa = async (partialToken: string, otp: string) => {
    const { data } = await api.post('/auth/mfa/verify', { partial_token: partialToken, otp });
    persistSession(data);
  };

  const persistSession = (data: any) => {
    const user: User = { id: data.userId, tenantId: data.tenant_id, branchId: data.branch_id, role: data.role, name: data.name ?? data.role };
    localStorage.setItem('ethiopos_token',   data.access_token);
    localStorage.setItem('ethiopos_refresh', data.refresh_token);
    localStorage.setItem('ethiopos_user',    JSON.stringify(user));
    setToken(data.access_token);
    setUser(user);
    router.push('/dashboard');
  };

  const logout = () => {
    localStorage.clear();
    setUser(null); setToken(null);
    router.push('/auth/login');
  };

  return (
    <AuthCtx.Provider value={{ user, token, login, loginPin, verifyMfa, logout, isLoading }}>
      {children}
    </AuthCtx.Provider>
  );
}

// ─── src/hooks/useProducts.ts ────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { offlineQueue } from '@/lib/offline-queue';

export function useProducts(branchId?: string, search?: string) {
  return useQuery({
    queryKey: ['products', branchId, search],
    queryFn:  () => api.get('/products', { params: { branchId, search } }).then(r => r.data),
    staleTime: 60_000,
  });
}

export function useSaleCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => api.post('/sales', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (_err, payload) => {
      // Queue for offline sync
      offlineQueue.add({ url: '/sales', method: 'POST', body: payload });
    },
  });
}

export function useLowStock(branchId?: string) {
  return useQuery({
    queryKey: ['lowStock', branchId],
    queryFn:  () => api.get('/products', { params: { status: 'low', branchId } }).then(r => r.data),
    refetchInterval: 5 * 60_000, // re-check every 5 min
  });
}

// ─── src/hooks/useAccounting.ts ──────────────────────────────
export function useProfitAndLoss(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['pl', startDate, endDate],
    queryFn:  () => api.get('/accounting/pl', { params: { startDate, endDate } }).then(r => r.data),
  });
}

export function useVATSummary(period: string) {
  return useQuery({
    queryKey: ['vat', period],
    queryFn:  () => api.get('/accounting/vat', { params: { period } }).then(r => r.data),
    staleTime: 10 * 60_000,
  });
}

// ─── src/hooks/useAI.ts ──────────────────────────────────────
export function useAIQuery() {
  return useMutation({
    mutationFn: (queryType: string) =>
      api.post('/ai/query', { queryType }, { timeout: 15_000 }).then(r => r.data),
  });
}

// ─── src/components/ui/offline-banner.tsx ───────────────────
'use client';
import { useEffect, useState } from 'react';
import { offlineQueue } from '@/lib/offline-queue';

export function OfflineBanner() {
  const [isOffline, setIsOffline]     = useState(false);
  const [pending,   setPending]       = useState(0);
  const [syncing,   setSyncing]       = useState(false);

  useEffect(() => {
    const online  = () => { setIsOffline(false); autoSync(); };
    const offline = () => setIsOffline(true);
    window.addEventListener('online',  online);
    window.addEventListener('offline', offline);
    setIsOffline(!navigator.onLine);
    setPending(offlineQueue.count());
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  const autoSync = async () => {
    const n = offlineQueue.count();
    if (!n) return;
    setSyncing(true);
    await offlineQueue.flush();
    setPending(offlineQueue.count());
    setSyncing(false);
  };

  if (!isOffline && pending === 0) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-sm font-semibold text-white
      ${isOffline ? 'bg-red-700' : 'bg-green-700'}`}
    >
      <span>
        {isOffline
          ? '🔴 Offline — Sales are saved locally and will sync when connected'
          : `🟢 Back online${pending > 0 ? ` — ${pending} transactions pending sync` : ''}`}
      </span>
      {!isOffline && pending > 0 && (
        <button
          onClick={autoSync}
          disabled={syncing}
          className="ml-4 rounded bg-white/20 px-3 py-1 text-xs hover:bg-white/30"
        >
          {syncing ? 'Syncing…' : '⚡ Sync Now'}
        </button>
      )}
    </div>
  );
}

// ─── src/app/auth/login/page.tsx ─────────────────────────────
'use client';
import { useState }   from 'react';
import { useRouter }  from 'next/navigation';
import { useAuth }    from '@/context/auth-context';
import { toast }      from 'sonner';

const ROLES = [
  { key: 'owner',         label: 'Business Owner',    icon: '👑', hint: 'Full access to all modules' },
  { key: 'branch_manager',label: 'Branch Manager',   icon: '🏪', hint: 'Branch ops & reporting' },
  { key: 'cashier',       label: 'Cashier',           icon: '🛒', hint: 'POS & sales only' },
  { key: 'accountant',    label: 'Accountant',        icon: '📊', hint: 'Finance & accounting' },
  { key: 'inventory_mgr', label: 'Inventory Manager', icon: '📦', hint: 'Stock & warehouse' },
  { key: 'hr_mgr',        label: 'HR Manager',        icon: '👥', hint: 'Staff & payroll' },
  { key: 'sales_mgr',     label: 'Sales Manager',     icon: '📈', hint: 'Sales & CRM' },
  { key: 'superadmin',    label: 'Super Admin',       icon: '⚡', hint: 'System administration' },
];

export default function LoginPage() {
  const [step,  setStep]  = useState<'role' | 'credentials' | 'pin' | 'mfa'>('role');
  const [role,  setRole]  = useState('');
  const [email, setEmail] = useState('');
  const [pass,  setPass]  = useState('');
  const [pin,   setPin]   = useState('');
  const [partialToken, setPartialToken] = useState('');
  const [otp,   setOtp]   = useState('');
  const [busy,  setBusy]  = useState(false);
  const { login, verifyMfa } = useAuth();

  const handleLogin = async () => {
    setBusy(true);
    try {
      const result = await login(email, pass);
      if ((result as any).mfaRequired) {
        setPartialToken((result as any).partialToken);
        setStep('mfa');
      }
    } catch {
      toast.error('Invalid credentials. Please try again.');
    } finally { setBusy(false); }
  };

  const handleMfa = async () => {
    setBusy(true);
    try { await verifyMfa(partialToken, otp); }
    catch { toast.error('Invalid OTP. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-700 to-amber-500 mx-auto mb-3 flex items-center justify-center text-2xl font-black text-white">E</div>
          <h1 className="text-2xl font-black text-white">EthioPOS</h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise ERP · ቢዝነስ አስተዳደር · Dhiyeessa Daldala</p>
        </div>

        {step === 'role' && (
          <div>
            <p className="text-slate-400 text-sm text-center mb-4">Select your role to continue</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <button key={r.key} onClick={() => { setRole(r.key); setStep('credentials'); }}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-left hover:border-blue-500 transition-colors"
                >
                  <div className="text-2xl mb-1">{r.icon}</div>
                  <div className="text-white font-bold text-sm">{r.label}</div>
                  <div className="text-slate-400 text-xs mt-0.5">{r.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'credentials' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
            <button onClick={() => setStep('role')} className="text-slate-400 text-sm mb-4 hover:text-white">← Back</button>
            <div className="text-center mb-5">
              <div className="text-3xl">{ROLES.find(r => r.key === role)?.icon}</div>
              <div className="text-white font-bold mt-1">{ROLES.find(r => r.key === role)?.label}</div>
            </div>
            <input type="email" placeholder="Email or phone"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm outline-none mb-3 focus:border-blue-500"
            />
            <input type="password" placeholder="Password"
              value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-white text-sm outline-none mb-4 focus:border-blue-500"
            />
            <button onClick={handleLogin} disabled={busy}
              className="w-full bg-blue-700 hover:bg-blue-600 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign In →'}
            </button>
          </div>
        )}

        {step === 'mfa' && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">🔐</div>
            <h2 className="text-white font-bold mb-1">Two-Factor Authentication</h2>
            <p className="text-slate-400 text-sm mb-4">Enter the 6-digit code from your authenticator app</p>
            <input type="text" placeholder="000000" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,''))}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white text-xl text-center tracking-widest outline-none mb-4 focus:border-blue-500"
            />
            <button onClick={handleMfa} disabled={busy || otp.length !== 6}
              className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-2.5 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Verifying…' : '✓ Verify'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── public/manifest.json — PWA Manifest ─────────────────────
// {
//   "name": "EthioPOS — Ethiopian Business ERP",
//   "short_name": "EthioPOS",
//   "description": "21-module ERP for Ethiopian SMEs",
//   "start_url": "/dashboard",
//   "display": "standalone",
//   "background_color": "#0F172A",
//   "theme_color": "#1E40AF",
//   "orientation": "any",
//   "lang": "en",
//   "icons": [
//     { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
//     { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
//   ],
//   "categories": ["business", "finance", "productivity"],
//   "shortcuts": [
//     { "name": "Point of Sale", "url": "/pos",   "icons": [{ "src": "/icons/pos.png", "sizes": "96x96" }] },
//     { "name": "Inventory",     "url": "/inventory" },
//     { "name": "AI Insights",   "url": "/ai" }
//   ]
// }

// ─── package.json (key deps) ─────────────────────────────────
// {
//   "dependencies": {
//     "next": "14.x",
//     "react": "^18",
//     "react-dom": "^18",
//     "@tanstack/react-query": "^5",
//     "axios": "^1.6",
//     "next-pwa": "^5",
//     "sonner": "^1",          ← toast notifications
//     "recharts": "^2",
//     "lucide-react": "^0.383",
//     "tailwindcss": "^3"
//   }
// }
