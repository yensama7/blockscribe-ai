import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PaperCard } from '@/components/PaperCard';
import { api } from '@/services/api';
import { Archive, ShieldCheck, Search, Users } from 'lucide-react';

const StatusDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className="flex items-center gap-1 text-xs text-muted-foreground">
    <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
    {label}
  </span>
);

export default function Home() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const { data: status } = useQuery({ queryKey: ['component-status'], queryFn: api.status, refetchInterval: 15000 });
  const { data: recent = [] } = useQuery({ queryKey: ['papers', {}], queryFn: () => api.listPapers() });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {stats?.institution || 'Blockscribe'} Research Repository
          </CardTitle>
          <CardDescription className="max-w-3xl">
            Preservation infrastructure for African scholarship. Every deposit is replicated to
            IPFS, screened for similarity against the whole corpus, and anchored on Solana with a
            content-derived address — so authorship, dates and review history stay provable even
            if this server disappears. Reading is free, always.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link to="/submit"><Archive className="mr-2 h-4 w-4" />Deposit a paper</Link></Button>
            <Button asChild variant="outline"><Link to="/verify"><ShieldCheck className="mr-2 h-4 w-4" />Verify a document</Link></Button>
            <Button asChild variant="outline"><Link to="/papers"><Search className="mr-2 h-4 w-4" />Browse the archive</Link></Button>
          </div>
          {stats && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{stats.papers} papers</Badge>
              <Badge variant="secondary">{stats.anchored} on-chain anchors</Badge>
              <Badge variant="secondary">{stats.reviews} signed reviews</Badge>
              <Badge variant="secondary">{stats.published} published</Badge>
              <Badge variant="secondary"><Users className="mr-1 h-3 w-3" />{stats.users} researchers</Badge>
            </div>
          )}
          {status && (
            <div className="flex flex-wrap gap-4">
              <StatusDot ok={status.database} label="database" />
              <StatusDot ok={status.vector_service} label="similarity engine" />
              <StatusDot ok={status.ipfs} label="IPFS" />
              <StatusDot ok={status.solana} label="Solana" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent deposits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing here yet — be the first to deposit a paper.
            </p>
          )}
          {recent.slice(0, 8).map((paper) => <PaperCard key={paper.id} paper={paper} />)}
        </CardContent>
      </Card>
    </div>
  );
}
