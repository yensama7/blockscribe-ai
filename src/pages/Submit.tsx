import { ChangeEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { api, DepositResult } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Upload } from 'lucide-react';

export default function Submit() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [license, setLicense] = useState('CC-BY-4.0');
  const [visibility, setVisibility] = useState('public');
  const [embargoUntil, setEmbargoUntil] = useState('');
  const [result, setResult] = useState<DepositResult | null>(null);

  const depositMutation = useMutation({
    mutationFn: () =>
      api.deposit(file!, {
        title,
        discipline,
        license,
        visibility,
        embargo_until: visibility === 'embargoed' ? embargoUntil : '',
      }),
    onSuccess: (deposited) => {
      setResult(deposited);
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast({ title: 'Deposited', description: 'Your paper is preserved and its priority claim is anchored.' });
    },
    onError: (error) =>
      toast({ title: 'Deposit failed', description: String(error instanceof Error ? error.message : error), variant: 'destructive' }),
  });

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deposit a paper</CardTitle>
          <CardDescription>Sign in with your institutional email first — no wallet needed.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Deposit a paper</CardTitle>
          <CardDescription>
            On deposit we extract the metadata, screen the full text for similarity against the
            corpus, replicate the file to IPFS, and anchor a timestamped priority claim on Solana:
            “this exact document existed on this date, deposited by this account.”
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Paper (PDF or text)</Label>
            <Input type="file" accept=".pdf,.txt,.md" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Title (leave blank to auto-extract)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-extracted from the PDF" />
            </div>
            <div className="space-y-1">
              <Label>Discipline (leave blank to auto-extract)</Label>
              <Input value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="e.g. Public Health" />
            </div>
            <div className="space-y-1">
              <Label>License</Label>
              <Select value={license} onValueChange={setLicense}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CC-BY-4.0">CC-BY 4.0 (recommended)</SelectItem>
                  <SelectItem value="CC-BY-SA-4.0">CC-BY-SA 4.0</SelectItem>
                  <SelectItem value="CC-BY-NC-4.0">CC-BY-NC 4.0</SelectItem>
                  <SelectItem value="All rights reserved">All rights reserved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Access</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Open access (free to read)</SelectItem>
                  <SelectItem value="embargoed">Embargoed (auto-release on a date)</SelectItem>
                  <SelectItem value="metadata_only">Metadata only (catalogue entry, no full text)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visibility === 'embargoed' && (
              <div className="space-y-1">
                <Label>Embargo release date</Label>
                <Input type="date" value={embargoUntil} onChange={(e) => setEmbargoUntil(e.target.value)} />
              </div>
            )}
          </div>
          <Button onClick={() => depositMutation.mutate()} disabled={!file || depositMutation.isPending}>
            <Upload className="mr-2 h-4 w-4" />
            {depositMutation.isPending ? 'Extracting, screening, pinning, anchoring…' : 'Deposit'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-500/40">
          <CardHeader>
            <CardTitle>Deposit receipt</CardTitle>
            <CardDescription>
              <Link to={`/papers/${result.submission_id}`} className="underline">
                Open the paper's landing page
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Title:</span> {result.title}</p>
            <p className="break-all"><span className="text-muted-foreground">SHA-256 fingerprint:</span> {result.file_hash}</p>
            {result.cid && <p className="break-all"><span className="text-muted-foreground">IPFS CID:</span> {result.cid}</p>}
            <p className="break-all">
              <span className="text-muted-foreground">On-chain address (derived from the fingerprint):</span>{' '}
              {result.anchor.pda_address}
            </p>
            <p>
              <span className="text-muted-foreground">Anchor:</span>{' '}
              {result.anchor.status === 'confirmed' ? (
                <Badge className="bg-emerald-500/20 text-emerald-300">
                  confirmed @ slot {result.anchor.slot}
                </Badge>
              ) : (
                <Badge variant="secondary">{result.anchor.status} — will reconcile when the chain is reachable</Badge>
              )}
            </p>
            <p>
              <span className="text-muted-foreground">Similarity screening:</span>{' '}
              {result.similarity.flagged_chunks > 0 ? (
                <Badge className="bg-amber-500/20 text-amber-300">
                  {result.similarity.passages} passage(s) matched existing work — an editor will see the side-by-side
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/20 text-emerald-300">no matches above threshold</Badge>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
