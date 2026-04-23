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
import { sendFeeSplitTransfer, sendMemoTransaction } from '@/lib/solanaTransactions';

const hashFileSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const BlockchainUI = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { walletAddress, connectedProvider, requireWallet } = useWallet();

  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [selectedIntegrityFile, setSelectedIntegrityFile] = useState<File | null>(null);
  const [verificationHash, setVerificationHash] = useState('');
  const [integrityResult, setIntegrityResult] = useState<{ found: boolean; record?: ArchiveRecord } | null>(null);
  const [accessType, setAccessType] = useState<'open' | 'restricted'>('open');
  const [publishFee, setPublishFee] = useState(1000);

  const { data: library = [] } = useQuery({ queryKey: ['library-metadata'], queryFn: api.getAllMetadata });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, wallet }: { file: File; wallet: string }) => {
      if (!connectedProvider) throw new Error('No connected wallet provider');
      const prepared = await api.prepareUpload(file, accessType, publishFee);
      const signature = await sendMemoTransaction(connectedProvider, prepared.memo_text);
      await api.confirmUpload(prepared.upload_id, wallet, signature);
      return prepared;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library-metadata'] });
      queryClient.invalidateQueries({ queryKey: ['library-highlights'] });
      toast({ title: 'Uploaded', description: 'Backend prepared hash/CID, wallet signed memo, backend verified and saved.' });
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
    if (!selectedIntegrityFile || !requireWallet()) {
      toast({ title: 'Wallet required', description: 'Link wallet before integrity check.', variant: 'destructive' });
      return;
    }
    const hash = await hashFileSha256(selectedIntegrityFile);
    setVerificationHash(hash);
    integrityMutation.mutate(hash);
  };

  const handleDownload = async (record: ArchiveRecord) => {
    if (!requireWallet() || !connectedProvider) {
      toast({ title: 'Wallet required', description: 'Link wallet before download.', variant: 'destructive' });
      return;
    }

    try {
      const integrity = await api.verifyFileHash(record.file_hash);
      if (!integrity.exists) {
        toast({ title: 'Integrity mismatch', description: 'Cannot download: hash not anchored.', variant: 'destructive' });
        return;
      }

      const quote = await api.getDownloadQuote(record.id, walletAddress);
      let transferSig = '';

      if (quote.access_type === 'restricted') {
        transferSig = await sendFeeSplitTransfer(
          connectedProvider,
          quote.uploader_wallet || walletAddress,
          quote.developer_wallet,
          quote.amount_lamports_uploader,
          quote.amount_lamports_developer,
        );
      }

      const served = await api.verifyDownloadAndServe(record.id, walletAddress, transferSig);
      window.open(served.download_url, '_blank', 'noopener,noreferrer');
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
          <CardDescription>Step 1-5 flow: backend prepares hash/CID, wallet signs memo, backend verifies signature, then saves.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedUploadFile(event.target.files?.[0] || null)} />
          <div className="flex gap-2">
            <select value={accessType} onChange={(e) => setAccessType(e.target.value as 'open' | 'restricted')} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="open">Open access</option>
              <option value="restricted">Restricted access</option>
            </select>
            <Input type="number" min={0} value={publishFee} onChange={(e) => setPublishFee(Number(e.target.value) || 0)} />
          </div>
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
    </div>
  );
};
