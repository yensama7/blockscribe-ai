import { ChangeEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api, hashFileSha256, VerifyResult } from '@/services/api';
import { StatusBadge } from '@/components/PaperCard';
import { ShieldCheck, ShieldX } from 'lucide-react';

// Public verification — no account, no wallet. The file's SHA-256 is computed
// in the browser; the on-chain address is derived from that hash alone.
export default function Verify() {
  const location = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const runVerify = async (hex: string) => {
    setBusy(true);
    setError('');
    try {
      setResult(await api.verifyHash(hex));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  // support /verify?hash=... deep links from paper pages
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('hash');
    if (fromUrl) {
      setHash(fromUrl);
      runVerify(fromUrl);
    }
  }, [location.search]);

  const handleFile = async (selected: File) => {
    setFile(selected);
    const hex = await hashFileSha256(selected);
    setHash(hex);
    await runVerify(hex);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Verify a document</CardTitle>
          <CardDescription>
            Drop any file. Its fingerprint (SHA-256) is computed here in your browser and checked
            against the archive and the blockchain. Anyone can do this — no account needed, and
            the archive operator cannot fake the answer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {file && <p className="text-xs text-muted-foreground">File: {file.name}</p>}
          {hash && <p className="text-xs break-all text-muted-foreground">SHA-256: {hash}</p>}
          {busy && <p className="text-sm text-muted-foreground">Checking the archive and the chain…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card className={result.exists ? 'border-emerald-500/40' : 'border-red-500/40'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.exists ? (
                <><ShieldCheck className="h-5 w-5 text-emerald-400" /> Document found in the archive</>
              ) : (
                <><ShieldX className="h-5 w-5 text-red-400" /> Not in the archive</>
              )}
            </CardTitle>
            {result.exists && result.record && (
              <CardDescription>
                Deposited {new Date(result.record.deposited_at).toLocaleString()} by{' '}
                {result.record.authors || 'unknown authors'} at {result.record.institution}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {result.exists && result.record ? (
              <>
                <p className="font-medium">
                  <Link to={`/papers/${result.record.submission_id}`} className="hover:underline">
                    {result.record.title}
                  </Link>
                  <span className="ml-2"><StatusBadge status={result.record.status} /></span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Version {result.record.version_no} • DOI {result.record.doi}
                </p>
                <p className="text-xs break-all text-muted-foreground">
                  On-chain address (anyone can derive this from the file alone): {result.pda_address}
                </p>
                {result.verified ? (
                  <div className="space-y-1">
                    <Badge className="bg-emerald-500/20 text-emerald-300">Anchored on Solana</Badge>
                    {result.anchors?.map((anchor, i) => (
                      <p key={i} className="text-xs break-all text-muted-foreground">
                        {anchor.instruction}: tx {anchor.signature.slice(0, 32)}… @ slot {anchor.slot}
                        {anchor.confirmed_at && ` (${new Date(anchor.confirmed_at).toLocaleString()})`}
                      </p>
                    ))}
                  </div>
                ) : (
                  <Badge variant="secondary">In the catalogue, chain anchor pending</Badge>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                This exact file has never been deposited. Even a one-character change produces a
                completely different fingerprint — which is the point.
              </p>
            )}
            <p className="text-xs break-all text-muted-foreground">Derived address: {result.pda_address}</p>
          </CardContent>
        </Card>
      )}

      {!result && !busy && (
        <Card>
          <CardContent className="pt-6">
            <Button variant="outline" size="sm" disabled>
              Tip: verify the same PDF twice — then change one word and watch it fail
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
