import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge } from '@/components/PaperCard';
import { ReviewerPicker } from '@/components/ReviewerPicker';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const EditorDesk = () => {
  const { data: papers = [] } = useQuery({ queryKey: ['papers', {}], queryFn: () => api.listPapers() });
  const inFlight = papers.filter((p) => ['submitted', 'under_review', 'reviewed'].includes(p.status));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Reviewers are matched by expertise and assigned automatically when a paper is deposited. Add
        another expertise-matched reviewer here if you'd like an extra opinion.
      </p>
      {inFlight.length === 0 && (
        <p className="text-sm text-muted-foreground">No submissions currently in review.</p>
      )}
      {inFlight.map((paper) => (
        <Card key={paper.id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  <Link to={`/papers/${paper.id}`} className="hover:underline">{paper.title}</Link>
                </CardTitle>
                <CardDescription>
                  {paper.author_name} • {paper.discipline} • v{paper.version_no}
                </CardDescription>
              </div>
              <StatusBadge status={paper.status} />
            </div>
          </CardHeader>
          <CardContent>
            <ReviewerPicker submissionId={paper.id} versionId={paper.version_id} label="Add a reviewer" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const MyAssignments = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { text: string; recommendation: string }>>({});

  const { data: assignments = [] } = useQuery({ queryKey: ['my-assignments'], queryFn: api.myAssignments });

  const reviewMutation = useMutation({
    mutationFn: ({ id, text, recommendation }: { id: string; text: string; recommendation: string }) =>
      api.submitReview(id, text, recommendation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast({ title: 'Review submitted', description: 'Signed with your key and anchored on-chain.' });
    },
    onError: (error) => toast({ title: 'Review failed', description: String(error), variant: 'destructive' }),
  });

  return (
    <div className="space-y-3">
      {assignments.length === 0 && (
        <p className="text-sm text-muted-foreground">No review assignments yet.</p>
      )}
      {assignments.map((assignment) => {
        const draft = drafts[assignment.id] || { text: '', recommendation: '' };
        const done = assignment.state === 'completed';
        return (
          <Card key={assignment.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">
                  <Link to={`/papers/${assignment.submission_id}`} className="hover:underline">
                    {assignment.title}
                  </Link>
                </CardTitle>
                <Badge variant={done ? 'default' : 'secondary'}>{assignment.state}</Badge>
              </div>
              <CardDescription>
                Version {assignment.version_no} • assigned {new Date(assignment.assigned_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            {!done && (
              <CardContent className="space-y-2">
                <Textarea
                  placeholder="Your review. It will be pinned to IPFS, hashed, signed with your key, and anchored — permanent, portable proof of your review labour."
                  value={draft.text}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [assignment.id]: { ...draft, text: e.target.value } }))
                  }
                  rows={5}
                />
                <div className="flex items-center gap-2">
                  <Select
                    value={draft.recommendation}
                    onValueChange={(value) =>
                      setDrafts((prev) => ({ ...prev, [assignment.id]: { ...draft, recommendation: value } }))
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Recommendation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accept">Accept</SelectItem>
                      <SelectItem value="minor_revisions">Minor revisions</SelectItem>
                      <SelectItem value="major_revisions">Major revisions</SelectItem>
                      <SelectItem value="reject">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!draft.text.trim() || !draft.recommendation || reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({ id: assignment.id, text: draft.text, recommendation: draft.recommendation })
                    }
                  >
                    {reviewMutation.isPending ? 'Signing & anchoring…' : 'Submit signed review'}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default function Review() {
  const { user, isEditor } = useAuth();

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Peer review</CardTitle>
          <CardDescription>Sign in to see your assignments{isEditor ? ' and the editorial desk' : ''}.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Tabs defaultValue={isEditor ? 'desk' : 'mine'}>
      <TabsList>
        {isEditor && <TabsTrigger value="desk">Editorial desk</TabsTrigger>}
        <TabsTrigger value="mine">My review assignments</TabsTrigger>
      </TabsList>
      {isEditor && (
        <TabsContent value="desk">
          <EditorDesk />
        </TabsContent>
      )}
      <TabsContent value="mine">
        <MyAssignments />
      </TabsContent>
    </Tabs>
  );
}
