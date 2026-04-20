import { ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Upload,
  ShieldCheck,
  Download,
  ExternalLink,
  Sparkles,
  Shield,
  Database,
  ChevronsUpDown,
  Search,
  Star,
  Clock,
  Shuffle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { api, ArchiveRecord, DownloadFeePlan } from '@/services/api';

type WalletProviderName = 'Phantom' | 'Backpack' | 'Solflare' | 'Glow' | 'Exodus' | 'Wallet';

interface SolanaProvider {
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  isGlow?: boolean;
  isExodus?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider & { providers?: SolanaProvider[] };
  }
}

const DEVELOPER_WALLET = import.meta.env.VITE_DEVELOPER_WALLET || 'DEV_WALLET_PLACEHOLDER';

const hashFileSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getProviderName = (provider: SolanaProvider): WalletProviderName => {
  if (provider.isPhantom) return 'Phantom';
  if (provider.isBackpack) return 'Backpack';
  if (provider.isSolflare) return 'Solflare';
  if (provider.isGlow) return 'Glow';
  if (provider.isExodus) return 'Exodus';
  return 'Wallet';
};

export const BlockchainUI = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [walletAddress, setWalletAddress] = useState('');
  const [walletName, setWalletName] = useState<WalletProviderName | null>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedIntegrityFile, setSelectedIntegrityFile] = useState<File | null>(null);
  const [verificationHash, setVerificationHash] = useState('');
  const [integrityResult, setIntegrityResult] = useState<{ found: boolean; record?: ArchiveRecord } | null>(null);
  const [accessType, setAccessType] = useState<'open' | 'restricted'>('open');
  const [publishFee, setPublishFee] = useState(1000);
  const [searchInput, setSearchInput] = useState('');

  const { data: library = [], isLoading, error: metadataError } = useQuery({
    queryKey: ['library-metadata'],
    queryFn: api.getAllMetadata,
  });

  const { data: highlights } = useQuery({
    queryKey: ['library-highlights'],
    queryFn: api.getLibraryHighlights,
  });

  const availableWallets = useMemo(() => {
    if (!window.solana) return [];
    const providers = window.solana.providers?.length ? window.solana.providers : [window.solana];
    const unique = new Map<string, SolanaProvider>();

    providers.forEach((provider) => unique.set(getProviderName(provider), provider));
    return [...unique.entries()].map(([name, provider]) => ({ name: name as WalletProviderName, provider }));
  }, []);

  const walletConnected = Boolean(walletAddress);

  const walletPill = useMemo(() => {
    if (!walletAddress) return 'Wallet not connected';
    const shortAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    return walletName ? `${walletName} • ${shortAddress}` : shortAddress;
  }, [walletAddress, walletName]);

  const requireWallet = () => {
    if (walletConnected) return true;
    toast({
      title: 'Wallet required',
      description: 'Connect a Solana wallet before upload, integrity checks, and downloads.',
      variant: 'destructive',
    });
    return false;
  };

  const connectWallet = async (provider: SolanaProvider, name: WalletProviderName) => {
    try {
      const wallet = await provider.connect();
      const address = wallet.publicKey.toString();
      setWalletAddress(address);
      setWalletName(name);
      toast({ title: `${name} connected`, description: `${address.slice(0, 8)}... linked successfully.` });
    } catch (error) {
      toast({
        title: `${name} connection failed`,
        description: error instanceof Error ? error.message : 'Could not connect wallet.',
        variant: 'destructive',
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: ({ file, wallet }: { file: File; wallet: string }) =>
      api.uploadFile(file, wallet, accessType, publishFee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['library-highlights'] });
      setSelectedUploadFile(null);
      toast({ title: 'Upload complete', description: 'Document saved to IPFS and anchored on-chain.' });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Publishing failed.',
        variant: 'destructive',
      });
    },
  });

  const searchMutation = useMutation({
    mutationFn: api.searchByTitle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-highlights'] });
    },
    onError: (error) => {
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Unable to search library.',
        variant: 'destructive',
      });
    },
  });

  const integrityMutation = useMutation({
    mutationFn: api.verifyFileHash,
    onSuccess: (result) => {
      setIntegrityResult({ found: result.exists, record: result.record });
      toast({
        title: result.exists ? 'Integrity verified' : 'Hash not found',
        description: result.exists
          ? `Source wallet: ${result.record?.uploader_wallet || 'unknown'} • Hash: ${result.record?.file_hash || verificationHash}`
          : 'Document did not originate from this library.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Integrity check failed',
        description: error instanceof Error ? error.message : 'Integrity verification failed.',
        variant: 'destructive',
      });
    },
  });

  const handleUpload = () => {
    if (!selectedUploadFile || !requireWallet()) return;
    uploadMutation.mutate({ file: selectedUploadFile, wallet: walletAddress });
  };

  const handleSearch = () => {
    if (!searchInput.trim()) return;
    searchMutation.mutate(searchInput.trim());
  };

  const documentsToRender = searchMutation.data ?? library;

  const handleIntegrity = async () => {
    if (!selectedIntegrityFile || !requireWallet()) return;
    const hash = await hashFileSha256(selectedIntegrityFile);
    setVerificationHash(hash);
    integrityMutation.mutate(hash);
  };

  const handleDownload = async (record: ArchiveRecord) => {
    if (!requireWallet()) return;

    const integrity = await api.verifyFileHash(record.file_hash);
    if (!integrity.exists) {
      toast({
        title: 'Integrity check failed',
        description: 'On-chain/database integrity verification failed before download.',
        variant: 'destructive',
      });
      return;
    }

    let feePlan: DownloadFeePlan | null = null;
    try {
      feePlan = await api.registerDownload(record.id, walletAddress);
    } catch {
      toast({
        title: 'Download opened',
        description: 'Fee-plan endpoint unavailable; file opened directly.',
      });
    }

    if (record.access_type === 'restricted' && feePlan) {
      toast({
        title: 'Restricted document',
        description: `Downloader pays ${feePlan.amount_lamports_total} lamports (${feePlan.amount_lamports_uploader} uploader + ${feePlan.amount_lamports_developer} developer).`,
      });
    }

    window.open(`https://ipfs.io/ipfs/${record.file_cid}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen neural-network px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card className="border-primary/40 bg-card/70 backdrop-blur-lg blockchain-glow">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-6 w-6 text-primary" /> Blockscribe Web3 Library
                </CardTitle>
                <CardDescription>
                  Search by title, browse ranked/recent/random documents, and verify integrity before download.
                </CardDescription>
              </div>
              <Badge variant={walletConnected ? 'default' : 'secondary'} className="px-3 py-1">
                {walletPill}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableWallets.length === 0 ? (
              <p className="text-sm text-destructive">No Solana wallet detected. Install Phantom, Backpack, Solflare, Glow, or Exodus.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                {availableWallets.map((wallet) => (
                  <Button key={wallet.name} variant="secondary" onClick={() => connectWallet(wallet.provider, wallet.name)}>
                    Connect {wallet.name}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Developer wallet: {DEVELOPER_WALLET}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/70 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Library Search
            </CardTitle>
            <CardDescription>Search by document name/title (updates ranking metrics).</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by title..." />
            <Button onClick={handleSearch}>Search</Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4" /> Top 15 Searched</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {highlights?.top_searched.slice(0, 5).map((d) => <p key={d.id} className="text-sm">{d.title}</p>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" /> Recent 10</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {highlights?.recent.slice(0, 5).map((d) => <p key={d.id} className="text-sm">{d.title}</p>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Shuffle className="h-4 w-4" /> Random Picks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {highlights?.random.slice(0, 5).map((d) => <p key={d.id} className="text-sm">{d.title}</p>)}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-primary/20 bg-card/70 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" /> Publish Document
              </CardTitle>
              <CardDescription>Choose open or restricted access and upload fee preference.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedUploadFile(event.target.files?.[0] || null)} />
              <div className="flex gap-2">
                <select
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value as 'open' | 'restricted')}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="open">Open access</option>
                  <option value="restricted">Restricted access</option>
                </select>
                <Input
                  type="number"
                  min={0}
                  value={publishFee}
                  onChange={(e) => setPublishFee(Number(e.target.value) || 0)}
                  placeholder="Publish fee lamports"
                />
              </div>
              <Button className="w-full gradient-primary" onClick={handleUpload} disabled={!selectedUploadFile || uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Publishing...' : 'Publish to chain'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-accent/30 bg-card/70 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" /> Verify Origin
              </CardTitle>
              <CardDescription>If hash matches, return sender wallet + hash; otherwise return origin error.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedIntegrityFile(event.target.files?.[0] || null)} />
              <Button className="w-full" onClick={handleIntegrity} disabled={!selectedIntegrityFile || integrityMutation.isPending}>
                {integrityMutation.isPending ? 'Verifying...' : 'Verify integrity'}
              </Button>
              {verificationHash && <p className="break-all text-xs text-muted-foreground">SHA-256: {verificationHash}</p>}
              {integrityResult && (
                <Badge variant={integrityResult.found ? 'default' : 'secondary'}>
                  {integrityResult.found ? `Yes: ${integrityResult.record?.uploader_wallet}` : 'No: document did not originate from library'}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> Library Documents
            </CardTitle>
            <CardDescription>Integrity is verified before download; restricted docs show incentive split.</CardDescription>
          </CardHeader>
          <CardContent>
            {metadataError && (
              <p className="mb-4 text-sm text-destructive">Failed to load library metadata. Ensure backend is running on port 5000.</p>
            )}
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading documents...</p>
            ) : documentsToRender.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents found.</p>
            ) : (
              <div className="space-y-4">
                {documentsToRender.map((record) => (
                  <div key={record.id} className="rounded-lg border border-border/50 bg-background/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{record.title}</p>
                        <p className="text-xs text-muted-foreground">CID: {record.file_cid}</p>
                        <p className="text-xs text-muted-foreground">Uploader: {record.uploader_wallet || 'not recorded'}</p>
                        <p className="text-xs text-muted-foreground">Difficulty: {record.difficulty}</p>
                        <p className="text-xs text-muted-foreground">Access: {record.access_type || 'open'} • Searches: {record.search_count || 0}</p>
                      </div>
                      <Button size="sm" onClick={() => handleDownload(record)}>
                        <Download className="mr-2 h-4 w-4" /> Download <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                    {integrityResult?.record?.id === record.id && (
                      <div className="mt-2">
                        <Badge className="gap-1"><Shield className="h-3 w-3" /> Matched integrity result</Badge>
                      </div>
                    )}
                    <Separator className="mt-4" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
