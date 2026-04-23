import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/context/WalletContext';

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { availableWallets, connectWallet, disconnectWallet, walletConnected, walletPill } = useWallet();

  const connect = async () => {
    if (!availableWallets.length) {
      toast({ title: 'No wallet found', description: 'Install a Solana wallet extension.', variant: 'destructive' });
      return;
    }
    try {
      const preferred = availableWallets[0];
      await connectWallet(preferred.provider, preferred.name);
      toast({ title: 'Wallet linked', description: `${preferred.name} connected.` });
    } catch (error) {
      toast({
        title: 'Wallet connection failed',
        description: error instanceof Error ? error.message : 'Unable to connect wallet.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen neural-network">
      <header className="border-b border-border/40 bg-card/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="font-semibold text-lg">Blockscribe</Link>
            <Link to="/books" className="text-sm text-muted-foreground hover:text-foreground">All Books A–Z</Link>
            <Link to="/hot" className="text-sm text-muted-foreground hover:text-foreground">Hot Books</Link>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search books..."
              onKeyDown={(event) => {
                const query = event.currentTarget.value.trim();
                if (event.key === 'Enter' && query) {
                  navigate(`/books?q=${encodeURIComponent(query)}`);
                }
              }}
              className="w-56"
            />
            <Badge variant={walletConnected ? 'default' : 'secondary'}>{walletPill}</Badge>
            {walletConnected ? (
              <Button variant="outline" onClick={disconnectWallet}>Remove wallet</Button>
            ) : (
              <Button onClick={connect}>Link wallet</Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
};
