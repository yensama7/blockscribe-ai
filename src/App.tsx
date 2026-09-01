import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import Home from './pages/Home';
import Papers from './pages/Papers';
import PaperDetail from './pages/PaperDetail';
import Submit from './pages/Submit';
import Verify from './pages/Verify';
import Review from './pages/Review';
import Account from './pages/Account';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/papers" element={<Papers />} />
              <Route path="/papers/:id" element={<PaperDetail />} />
              <Route path="/submit" element={<Submit />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/review" element={<Review />} />
              <Route path="/account" element={<Account />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
