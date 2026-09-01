import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { BookOpenCheck } from 'lucide-react';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'} hover:text-foreground`;

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, login, logout, isEditor } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setBusy(true);
    try {
      const loggedIn = await login(email, name);
      setDialogOpen(false);
      toast({
        title: `Welcome, ${loggedIn.display_name}`,
        description: loggedIn.role === 'editor' ? 'You have editor access.' : 'You can now deposit papers.',
      });
    } catch (error) {
      toast({
        title: 'Sign in failed',
        description: error instanceof Error ? error.message : 'Could not sign in.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen neural-network">
      <header className="border-b border-border/40 bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
              <BookOpenCheck className="h-5 w-5" /> Blockscribe
            </Link>
            <NavLink to="/papers" className={navLinkClass}>Browse</NavLink>
            <NavLink to="/submit" className={navLinkClass}>Deposit</NavLink>
            <NavLink to="/verify" className={navLinkClass}>Verify</NavLink>
            <NavLink to="/review" className={navLinkClass}>Review</NavLink>
            <NavLink to="/account" className={navLinkClass}>Account</NavLink>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search research..."
              onKeyDown={(event) => {
                const query = event.currentTarget.value.trim();
                if (event.key === 'Enter' && query) {
                  navigate(`/papers?q=${encodeURIComponent(query)}`);
                }
              }}
              className="w-56"
            />
            {user ? (
              <>
                <Badge variant={isEditor ? 'default' : 'secondary'}>
                  {user.display_name} • {user.role}
                </Badge>
                <Button variant="outline" onClick={logout}>Sign out</Button>
              </>
            ) : (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Sign in</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sign in with your institutional email</DialogTitle>
                    <DialogDescription>
                      No wallet, no extension, no seed phrase. A secure signing key is created and
                      held for you by your institution.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@university.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="login-name">Display name (optional)</Label>
                      <Input
                        id="login-name"
                        placeholder="Dr. Amina Bello"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      />
                    </div>
                    <Button onClick={handleLogin} disabled={busy || !email.includes('@')} className="w-full">
                      {busy ? 'Signing in...' : 'Sign in'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
};
