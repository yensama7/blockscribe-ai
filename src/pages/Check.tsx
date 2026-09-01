import { ChangeEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SimilarityPanel } from '@/components/SimilarityPanel';
import { api, PlagiarismResult } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { ScanSearch } from 'lucide-react';

// Optional pre-flight check: run the same similarity screen an editor sees,
// WITHOUT depositing, ingesting, or anchoring anything. Nothing is stored.
export default function Check() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PlagiarismResult | null>(null);

  const run = async (file: File) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.plagiarismCheck(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Originality check</CardTitle>
          <CardDescription>Sign in to check a draft against the archive before depositing.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="hero-rule mb-3" />
        <h1 className="font-display text-3xl font-semibold">Originality check</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Screen a draft against the whole archive <span className="font-medium text-foreground">before</span> you
          deposit it — the same meaning-based similarity report an editor would see. Nothing you upload here is
          stored, indexed, or anchored; it's just a private check.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a draft to check</CardTitle>
          <CardDescription>PDF or text. It never leaves this check — no record is created.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.files?.[0] && run(e.target.files[0])}
          />
          {busy && <p className="text-sm text-muted-foreground">Screening against the archive…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result?.already_deposited && (
            <Badge className="border-amber-300 bg-amber-100 text-amber-800">
              Heads up: this exact file is already in the archive
            </Badge>
          )}
        </CardContent>
      </Card>

      {result && (
        <SimilarityPanel summary={{ ...result, report: result }} />
      )}

      {result && result.flagged_chunks === 0 && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="pt-6 text-sm">
            No passages matched the existing corpus above the threshold. You're clear to{' '}
            <Link to="/submit" className="text-primary underline underline-offset-2">deposit this paper</Link>.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
