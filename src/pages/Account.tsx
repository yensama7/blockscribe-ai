import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PaperCard } from '@/components/PaperCard';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

export default function Account() {
  const { user, isEditor } = useAuth();
  const { toast } = useToast();

  const { data: myPapers = [] } = useQuery({
    queryKey: ['papers', 'mine'],
    queryFn: () => api.listPapers({ mine: true }),
    enabled: Boolean(user),
  });

  const { data: reputation } = useQuery({
    queryKey: ['reputation'],
    queryFn: api.myReputation,
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sign in with your institutional email to see your deposits.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rebuild = async () => {
    try {
      const result = await api.rebuildIndex();
      toast({
        title: 'Index rebuilt',
        description: `${result.papers} papers re-indexed into ${result.chunks} searchable chunks. The vector index is a cache — the archive itself is the source of truth.`,
      });
    } catch (error) {
      toast({ title: 'Rebuild failed', description: String(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{user.display_name}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Role: <Badge variant={isEditor ? 'default' : 'secondary'}>{user.role}</Badge>
          </p>
          <p className="break-all text-muted-foreground">
            Your signing address (created and kept safe by your institution — you never need to
            manage it): {user.wallet_pubkey}
          </p>
          {isEditor && (
            <Button variant="outline" size="sm" onClick={rebuild}>
              Rebuild search index (disaster-recovery drill)
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reviewer reputation</CardTitle>
          <CardDescription>
            Your track record as a reviewer — it follows you across every paper you review, and it's
            what the expertise matcher uses to surface good, reliable reviewers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reputation && reputation.assignments_total > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-4">
                <p className="font-display text-2xl font-semibold text-primary">{reputation.reviews_completed}</p>
                <p className="mt-1 text-xs text-muted-foreground">reviews completed</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-4">
                <p className="font-display text-2xl font-semibold text-primary">{Math.round(reputation.response_rate * 100)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">response rate</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-4">
                <p className="font-display text-2xl font-semibold text-primary">{Math.round(reputation.on_time_rate * 100)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">on time</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-secondary/40 p-4">
                <p className="font-display text-2xl font-semibold text-primary">{reputation.avg_turnaround_days}</p>
                <p className="mt-1 text-xs text-muted-foreground">avg days to review</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No reviews yet — once you're assigned and submit reviews, your reputation builds here.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My deposits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {myPapers.length === 0 && <p className="text-sm text-muted-foreground">No deposits yet.</p>}
          {myPapers.map((paper) => <PaperCard key={paper.id} paper={paper} />)}
        </CardContent>
      </Card>
    </div>
  );
}
