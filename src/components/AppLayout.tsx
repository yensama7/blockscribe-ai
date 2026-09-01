import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { BookMarked, ChevronDown, LogOut, Search, ShieldCheck, User } from 'lucide-react';

const NAV = [
  { to: '/papers', label: 'Browse' },
  { to: '/submit', label: 'Deposit' },
  { to: '/verify', label: 'Verify' },
  { to: '/review', label: 'Review' },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative text-sm transition-colors hover:text-primary',
    "after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-all after:content-['']",
    isActive ? 'text-primary font-medium after:w-full' : 'text-muted-foreground after:w-0 hover:after:w-full',
  ].join(' ');

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

  const initials = user?.display_name
    ? user.display_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '';

  return (
    <div className="flex min-h-screen flex-col page-bg">
      {/* brand strip */}
      <div className="border-b border-border/60 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs">
          <span className="opacity-90">Open-access academic repository · preservation you can verify</span>
          <span className="hidden items-center gap-1.5 opacity-90 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" /> Reading is always free
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookMarked className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold text-foreground">Blockscribe</span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Research Repository
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden lg:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search research…"
                onKeyDown={(event) => {
                  const query = event.currentTarget.value.trim();
                  if (event.key === 'Enter' && query) navigate(`/papers?q=${encodeURIComponent(query)}`);
                }}
                className="w-56 pl-8"
              />
            </div>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                      {initials}
                    </span>
                    <span className="hidden max-w-[8rem] truncate sm:inline">{user.display_name}</span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">{user.display_name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-primary">{user.role}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/account')}>
                    <User className="mr-2 h-4 w-4" /> My account
                  </DropdownMenuItem>
                  {isEditor && (
                    <DropdownMenuItem onClick={() => navigate('/review')}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Editorial desk
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Sign in</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display text-xl">Sign in with your institutional email</DialogTitle>
                    <DialogDescription>
                      No wallet, no extension, no seed phrase. A secure signing key is created and held
                      for you by your institution.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
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
                    <div className="space-y-1.5">
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
                      {busy ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* mobile nav */}
        <nav className="flex items-center gap-5 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="mt-8 border-t border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-primary" />
            <span className="font-display font-medium text-foreground">Blockscribe</span>
            <span className="hidden sm:inline">— preservation infrastructure that happens to use a blockchain.</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/papers" className="hover:text-primary">Browse</Link>
            <Link to="/verify" className="hover:text-primary">Verify a document</Link>
            <a href="/oai?verb=Identify" target="_blank" rel="noreferrer" className="hover:text-primary">OAI-PMH</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
