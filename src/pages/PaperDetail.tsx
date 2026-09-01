import { ChangeEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { PaperCard, StatusBadge } from '@/components/PaperCard';
import { SimilarityPanel } from '@/components/SimilarityPanel';
import { ReviewerPicker } from '@/components/ReviewerPicker';
import { api, gatewayLink } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Download, FileUp, ShieldCheck } from 'lucide-react';

// Dublin Core / Schema.org metadata on the landing page (restructure.md §10)
const setMetaTags = (tags: Record<string, string>) => {
  Object.entries(tags).forEach(([name, content]) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  });
};

export default function PaperDetail() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isEditor } = useAuth();
  const [retractReason, setRetractReason] = useState('');
  const [revisionFile, setRevisionFile] = useState<File | null>(null);

  const { data: paper, isLoading, error } = useQuery({
    queryKey: ['paper', id],
    queryFn: () => api.getPaper(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!paper) return;
    document.title = `${paper.title} — Blockscribe`;
    setMetaTags({
      'DC.title': paper.title,
      'DC.creator': paper.authors,
      'DC.description': paper.abstract,
      'DC.subject': paper.keywords || paper.discipline,
      'DC.language': paper.language,
      'DC.rights': paper.license,
      'DC.identifier': paper.doi,
      citation_title: paper.title,
      citation_author: paper.authors,
      citation_doi: paper.doi,
    });
  }, [paper]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['paper', id] });

  const publishMutation = useMutation({
    mutationFn: (versionId: string) => api.publish(versionId),
    onSuccess: () => { refresh(); toast({ title: 'Published', description: 'Status anchored on-chain.' }); },
    onError: (e) => toast({ title: 'Publish failed', description: String(e), variant: 'destructive' }),
  });

  const retractMutation = useMutation({
    mutationFn: ({ versionId, reason }: { versionId: string; reason: string }) => api.retract(versionId, reason),
    onSuccess: () => { refresh(); toast({ title: 'Retracted', description: 'Retraction recorded permanently on-chain.' }); },
    onError: (e) => toast({ title: 'Retract failed', description: String(e), variant: 'destructive' }),
  });

  const revisionMutation = useMutation({
    mutationFn: (file: File) => api.depositRevision(id, file),
    onSuccess: (result) => {
      refresh();
      setRevisionFile(null);
      toast({ title: `Version ${result.version_no} deposited`, description: 'Previous version marked superseded.' });
    },
    onError: (e) => toast({ title: 'Revision failed', description: String(e), variant: 'destructive' }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading paper...</p>;
  if (error || !paper) return <p className="text-sm text-destructive">Paper not found.</p>;

  const isAuthor = user?.id === paper.author_id;
  const currentVersion = paper.versions.find((v) => v.id === paper.version_id);
  const retraction = paper.status === 'retracted';

  return (
    <div className="space-y-6">
      {retraction && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-red-800">
              This paper has been retracted. The record below remains for the permanent scholarly
              record; the retraction itself is anchored on-chain and readable by citation tools.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">{paper.title}</CardTitle>
              <CardDescription className="mt-1">
                {paper.authors || paper.author_name} • {paper.institution}
              </CardDescription>
            </div>
            <StatusBadge status={paper.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{paper.abstract}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{paper.discipline}</Badge>
            <Badge variant="outline">{paper.language}</Badge>
            <Badge variant="outline">{paper.license}</Badge>
            <Badge variant="outline">DOI {paper.doi}</Badge>
            <Badge variant="outline">v{paper.version_no}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {paper.full_text_available && paper.cid ? (
              <Button asChild size="sm">
                <a href={gatewayLink(paper)} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" /> Read (free, via IPFS)
                </a>
              </Button>
            ) : (
              <Badge variant="secondary">
                {paper.visibility === 'embargoed'
                  ? `Full text under embargo${paper.embargo_until ? ` until ${paper.embargo_until}` : ''}`
                  : 'Metadata-only record'}
              </Badge>
            )}
            <Button asChild size="sm" variant="outline">
              <a href={`/verify?hash=${paper.file_hash}`}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Verify on-chain
              </a>
            </Button>
          </div>
          <Separator />
          <div className="text-xs text-muted-foreground space-y-1 break-all">
            <p>SHA-256: {paper.file_hash}</p>
            {paper.pda_address && <p>On-chain address (derived from the hash): {paper.pda_address}</p>}
            {paper.cid && <p>IPFS CID: {paper.cid}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history & on-chain anchors</CardTitle>
          <CardDescription>
            Every version keeps its own hash and anchor. Nothing is ever deleted — corrections are
            new state.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {paper.versions.map((version) => (
            <div key={version.id} className="rounded border border-border/40 px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Version {version.version_no}
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(version.created_at).toLocaleString()}
                  </span>
                </p>
                <StatusBadge status={version.status} />
              </div>
              {paper.anchors
                .filter((a) => a.version_id === version.id)
                .map((anchor, i) => (
                  <p key={i} className="text-xs text-muted-foreground break-all">
                    <Badge variant="outline" className="mr-2">{anchor.instruction}</Badge>
                    {anchor.status === 'confirmed'
                      ? `tx ${anchor.signature.slice(0, 20)}… @ slot ${anchor.slot}`
                      : `anchor ${anchor.status}`}
                  </p>
                ))}
            </div>
          ))}
          {(isAuthor || isEditor) && !retraction && (
            <div className="flex items-center gap-2 pt-2">
              <Input
                type="file"
                className="max-w-xs"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRevisionFile(e.target.files?.[0] || null)}
              />
              <Button
                size="sm"
                disabled={!revisionFile || revisionMutation.isPending}
                onClick={() => revisionFile && revisionMutation.mutate(revisionFile)}
              >
                <FileUp className="mr-2 h-4 w-4" />
                {revisionMutation.isPending ? 'Depositing…' : 'Deposit revision'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {paper.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Peer reviews</CardTitle>
            <CardDescription>
              Each review is pinned to IPFS, hashed, signed by the reviewer's key and anchored
              on-chain. Blind by default — identities are commitments, not names.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paper.reviews.map((review) => (
              <div key={review.id} className="rounded border border-border/40 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{review.reviewer}</p>
                  <Badge>{review.recommendation.replace('_', ' ')}</Badge>
                </div>
                <p className="text-sm whitespace-pre-wrap">{review.review_text}</p>
                <p className="text-xs text-muted-foreground break-all">
                  review hash {review.review_hash.slice(0, 24)}… • signature {review.reviewer_signature.slice(0, 24)}…
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {paper.similarity && (isAuthor || isEditor) && (
        <SimilarityPanel summary={paper.similarity} />
      )}

      {(isAuthor || isEditor) && !retraction && currentVersion &&
        ['submitted', 'under_review', 'reviewed'].includes(paper.status) && (
        <Card>
          <CardHeader>
            <CardTitle>Add a reviewer</CardTitle>
            <CardDescription>
              Reviewers are matched by expertise and assigned automatically on deposit. Add another
              expertise-matched reviewer — including a fellow editor — for an extra opinion. They'll
              find it under “My review assignments”. The author can't review their own paper.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewerPicker submissionId={paper.id} versionId={paper.version_id} label="Add a reviewer" />
          </CardContent>
        </Card>
      )}

      {isEditor && isAuthor && !retraction && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-800">
            You're an editor, but this is your own submission — to avoid a conflict of interest,
            another editor must publish or retract it. You can still add reviewers above.
          </CardContent>
        </Card>
      )}

      {isEditor && !isAuthor && !retraction && currentVersion && (
        <Card>
          <CardHeader>
            <CardTitle>Editorial actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={paper.status === 'published' || publishMutation.isPending}
                onClick={() => publishMutation.mutate(currentVersion.id)}
              >
                {publishMutation.isPending ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Retraction reason (recorded permanently)"
                value={retractReason}
                onChange={(e) => setRetractReason(e.target.value)}
                className="max-w-md"
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={!retractReason.trim() || retractMutation.isPending}
                onClick={() => retractMutation.mutate({ versionId: currentVersion.id, reason: retractReason })}
              >
                {retractMutation.isPending ? 'Retracting…' : 'Retract'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {paper.related.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related research</CardTitle>
            <CardDescription>Nearest neighbours in the vector space — connections across departments that citation graphs miss.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {paper.related.slice(0, 5).map((rel: { submission_id?: string; title?: string; score?: number }, i: number) => (
              <p key={i} className="text-sm">
                <a href={`/papers/${rel.submission_id}`} className="hover:underline">
                  {rel.title || rel.submission_id}
                </a>
                <span className="text-xs text-muted-foreground ml-2">
                  {typeof rel.score === 'number' ? `${(rel.score * 100).toFixed(0)}% similar` : ''}
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
