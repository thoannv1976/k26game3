import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Serif font with full Vietnamese coverage (Georgia lacks precomposed letters such as "ế",
// so browsers drew the accent as a detached combining mark). Only the subsets a page uses are downloaded.
import '@fontsource/gelasio/400.css';
import '@fontsource/gelasio/400-italic.css';
import '@fontsource/gelasio/700.css';
import './index.css';
import './i18n';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && ['NETWORK', 'INTERNAL'].includes((err as { code?: string }).code ?? ''),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
