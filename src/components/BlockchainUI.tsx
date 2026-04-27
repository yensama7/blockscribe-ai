import { ChangeEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, ShieldCheck, Download, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api, ArchiveRecord } from '@/services/api';
import { useWallet } from '@/context/WalletContext';
import { sendMemoTransaction } from '@/lib/solanaTransactions';

const hashFileSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const BlockchainUI = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { walletAddress, requireWallet, connectedProvider } = useWallet();

  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedIntegrityFile, setSelectedIntegrityFile] = useState<File | null>(null);
  const [verificationHash, setVerificationHash] = useState('');
  const [integrityResult, setIntegrityResult] = useState<{ found: boolean; record?: ArchiveRecord } | null>(null);

  const { data: library = [], isLoading: libraryLoading, error: libraryError } = useQuery({
    queryKey: ['library-metadata'],
    queryFn: api.getAllMetadata,
  });
  const { data: myUploads = [], isLoading: myUploadsLoading } = useQuery({
    queryKey: ['library-metadata-by-wallet', walletAddress],
    queryFn: () => api.getMetadataByWallet(walletAddress),
    enabled: Boolean(walletAddress),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, wallet }: { file: File; wallet: string }) => {
      const uploadResult = await api.uploadFile(file, wallet);
      const memoMessage =
        uploadResult.memo_message ||
        `book_hash:${uploadResult.file_record.file_hash};ipfs_cid:${uploadResult.file_record.file_cid}`;

      if (!connectedProvider) {
        throw new Error('Wallet provider is disconnected');
      }

      const signature = await sendMemoTransaction(connectedProvider, memoMessage);
      await api.confirmUploadSignature(uploadResult.file_record.file_hash, signature, wallet);
      return uploadResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['library-highlights'] });
      toast({ title: 'Uploaded', description: 'Document uploaded, memo signed, and metadata saved.' });
    },
    onError: (error) => {
      console.error('Upload flow error:', error);
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'Upload failed.', variant: 'destructive' });
    },
  });

  const integrityMutation = useMutation({
    mutationFn: api.verifyFileHash,
    onSuccess: (result) => setIntegrityResult({ found: result.exists, record: result.record }),
    onError: (error) => {
      console.error('Integrity mutation error:', error);
      toast({ title: 'Integrity failed', description: error instanceof Error ? error.message : 'Integrity check failed.', variant: 'destructive' });
    },
  });

  const handleUpload = () => {
    if (!selectedUploadFile || !requireWallet()) {
      toast({ title: 'Wallet required', description: 'Link wallet before upload.', variant: 'destructive' });
      return;
    }
    uploadMutation.mutate({ file: selectedUploadFile, wallet: walletAddress });
  };

  const handleIntegrity = async () => {
    if (!selectedIntegrityFile) {
      toast({ title: 'File required', description: 'Choose a file before integrity check.', variant: 'destructive' });
      return;
    }
    const hash = await hashFileSha256(selectedIntegrityFile);
    setVerificationHash(hash);
    integrityMutation.mutate(hash);
  };

  const handleDownload = async (record: ArchiveRecord) => {
    try {
      const integrity = await api.verifyFileHash(record.file_hash);
      if (!integrity.exists) {
        toast({ title: 'Integrity mismatch', description: 'Cannot download: hash not anchored.', variant: 'destructive' });
        return;
      }
      window.open(`https://ipfs.io/ipfs/${record.file_cid}`, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Download flow error:', error);
      toast({ title: 'Download failed', description: error instanceof Error ? error.message : 'Download failed.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>Upload a file, receive memo payload from backend, sign it with your wallet, then save the signature.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedUploadFile(event.target.files?.[0] || null)} />
          <Button onClick={handleUpload} disabled={!selectedUploadFile || uploadMutation.isPending}>
            <Upload className="mr-2 h-4 w-4" /> {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verify Document Origin</CardTitle>
          <CardDescription>Upload a file and compare hash against library anchors.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedIntegrityFile(event.target.files?.[0] || null)} />
          <Button onClick={handleIntegrity} disabled={!selectedIntegrityFile || integrityMutation.isPending}>
            <ShieldCheck className="mr-2 h-4 w-4" /> {integrityMutation.isPending ? 'Verifying...' : 'Verify'}
          </Button>
          {verificationHash && <p className="text-xs break-all text-muted-foreground">SHA-256: {verificationHash}</p>}
          {integrityResult && <Badge>{integrityResult.found ? `Yes: ${integrityResult.record?.uploader_wallet}` : 'No: document did not originate from library'}</Badge>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {libraryLoading && <p className="text-sm text-muted-foreground">Loading recent books...</p>}
          {libraryError && <p className="text-sm text-destructive">Could not load recent books. Check backend on port 5000.</p>}
          {library.slice(0, 6).map((record) => (
            <div key={record.id} className="flex items-center justify-between rounded border border-border/40 px-3 py-2">
              <div>
                <p className="font-medium">{record.title}</p>
                <p className="text-xs text-muted-foreground">{record.uploader_wallet || 'unknown uploader'} • {record.access_type || 'open'}</p>
              </div>
              <Button size="sm" onClick={() => handleDownload(record)}>
                <Download className="mr-1 h-4 w-4" /> Get <ExternalLink className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Wallet Memos</CardTitle>
          <CardDescription>Uploads indexed by your connected wallet address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!walletAddress && <p className="text-sm text-muted-foreground">Connect wallet to view your published memos.</p>}
          {walletAddress && myUploadsLoading && <p className="text-sm text-muted-foreground">Loading your memos...</p>}
          {walletAddress && !myUploadsLoading && myUploads.length === 0 && (
            <p className="text-sm text-muted-foreground">No uploads found for this wallet yet.</p>
          )}
          {myUploads.slice(0, 6).map((record) => (
            <div key={`wallet-${record.id}`} className="rounded border border-border/40 px-3 py-2">
              <p className="font-medium">{record.title}</p>
              <p className="text-xs break-all text-muted-foreground">
                wallet: {record.uploader_wallet || 'unknown'} • memo signature: {record.solana_signature || 'pending'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
