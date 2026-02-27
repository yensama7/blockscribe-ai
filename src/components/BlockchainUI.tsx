import { ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet, Upload, ShieldCheck, Download, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { api, ArchiveRecord, DownloadFeePlan } from '@/services/api';

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
    };
  }
}

const DEVELOPER_WALLET = import.meta.env.VITE_DEVELOPER_WALLET || 'DEV_WALLET_PLACEHOLDER';

const hashFileSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const BlockchainUI = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [walletAddress, setWalletAddress] = useState('');
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedVerificationFile, setSelectedVerificationFile] = useState<File | null>(null);
  const [verificationHash, setVerificationHash] = useState('');
  const [integrityResult, setIntegrityResult] = useState<{ found: boolean; record?: ArchiveRecord } | null>(null);

  const { data: library = [], isLoading } = useQuery({
    queryKey: ['library-metadata'],
    queryFn: api.getAllMetadata,
  });

  const walletConnected = Boolean(walletAddress);

  const walletLabel = useMemo(() => {
    if (!walletAddress) return 'Not connected';
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  const connectWallet = async () => {
    if (!window.solana?.isPhantom) {
      toast({
        title: 'Phantom wallet required',
        description: 'Install Phantom wallet to upload, download, or verify files.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const wallet = await window.solana.connect();
      const address = wallet.publicKey.toString();
      setWalletAddress(address);
      toast({
        title: 'Wallet connected',
        description: `Connected ${address.slice(0, 8)}...`,
      });
    } catch (error) {
      toast({
        title: 'Wallet connection failed',
        description: error instanceof Error ? error.message : 'Unable to connect wallet.',
        variant: 'destructive',
      });
    }
  };

  const ensureWallet = () => {
    if (walletConnected) return true;
    toast({
      title: 'Wallet required',
      description: 'Connect wallet first. Only navigation is available without a wallet.',
      variant: 'destructive',
    });
    return false;
  };

  const uploadMutation = useMutation({
    mutationFn: ({ file, wallet }: { file: File; wallet: string }) => api.uploadFile(file, wallet),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['library-metadata'] });
      setSelectedUploadFile(null);
      toast({
        title: 'Document published',
        description: `CID ${result.file_record.file_cid} anchored on-chain. Publish fee destination: ${DEVELOPER_WALLET}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unable to publish document.',
        variant: 'destructive',
      });
    },
  });

  const integrityMutation = useMutation({
    mutationFn: api.verifyFileHash,
    onSuccess: (result) => {
      setIntegrityResult({ found: result.exists, record: result.record });
      toast({
        title: result.exists ? 'Integrity match found' : 'No integrity record found',
        description: result.exists
          ? 'File hash exists in storage records and corresponding on-chain anchor.'
          : 'This hash has not been published to the library.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Integrity check failed',
        description: error instanceof Error ? error.message : 'Unable to verify document hash.',
        variant: 'destructive',
      });
    },
  });

  const handleUpload = () => {
    if (!ensureWallet() || !selectedUploadFile) return;
    uploadMutation.mutate({ file: selectedUploadFile, wallet: walletAddress });
  };

  const handleIntegrityCheck = async () => {
    if (!ensureWallet() || !selectedVerificationFile) return;
    const hash = await hashFileSha256(selectedVerificationFile);
    setVerificationHash(hash);
    integrityMutation.mutate(hash);
  };

  const downloadDocument = async (record: ArchiveRecord) => {
    if (!ensureWallet()) return;

    let feePlan: DownloadFeePlan | null = null;
    try {
      feePlan = await api.registerDownload(record.id, walletAddress);
    } catch {
      toast({
        title: 'Download started',
        description: 'Could not load fee routing details from backend, opening file anyway.',
      });
    }

    if (feePlan) {
      toast({
        title: 'Download fee plan',
        description: `Uploader: ${feePlan.amount_lamports_uploader} lamports, developer: ${feePlan.amount_lamports_developer} lamports.`,
      });
    }

    window.open(`https://ipfs.io/ipfs/${record.file_cid}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Wallet Gate</CardTitle>
          <CardDescription>
            Users can navigate freely. Upload, download, and integrity checks require wallet connection.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={walletConnected ? 'default' : 'secondary'}>{walletLabel}</Badge>
          <Button onClick={connectWallet}>{walletConnected ? 'Reconnect wallet' : 'Connect Phantom'}</Button>
          <p className="text-xs text-muted-foreground">Developer wallet: {DEVELOPER_WALLET}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Publish Document</CardTitle>
            <CardDescription>
              File goes to IPFS Kubo, hash + CID are anchored on-chain, and publish fee is routed to developer wallet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedUploadFile(event.target.files?.[0] || null)} />
            <Button onClick={handleUpload} disabled={!selectedUploadFile || uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Publishing...' : 'Publish document'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Check Integrity</CardTitle>
            <CardDescription>
              Upload any document to verify if its hash already exists in the library and on-chain archive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedVerificationFile(event.target.files?.[0] || null)} />
            <Button onClick={handleIntegrityCheck} disabled={!selectedVerificationFile || integrityMutation.isPending}>
              {integrityMutation.isPending ? 'Checking...' : 'Check integrity'}
            </Button>
            {verificationHash && <p className="break-all text-xs text-muted-foreground">SHA-256: {verificationHash}</p>}
            {integrityResult && (
              <Badge variant={integrityResult.found ? 'default' : 'secondary'}>
                {integrityResult.found ? 'Integrity match found' : 'No record for this hash'}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Library</CardTitle>
          <CardDescription>
            Downloading a document requests backend fee split details for uploader reimbursement + developer share.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading library...</p>
          ) : (
            <div className="space-y-4">
              {library.map((record) => (
                <div key={record.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{record.title}</p>
                      <p className="text-xs text-muted-foreground">CID: {record.file_cid}</p>
                    </div>
                    <Button size="sm" onClick={() => downloadDocument(record)}>
                      Download <ExternalLink className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Uploader: {record.uploader_wallet || 'not recorded'}</p>
                  {integrityResult?.record?.id === record.id && <Badge>Matched integrity check result</Badge>}
                  <Separator />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
