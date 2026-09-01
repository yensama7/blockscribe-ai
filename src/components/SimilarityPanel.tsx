import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SimilaritySummary } from '@/services/api';

// Show the passages, not just the number: "37% similar" is useless, a
// side-by-side of matched text is actionable (restructure.md §15). Scores are
// evidence for a human editor, never a verdict.
export const SimilarityPanel = ({ summary }: { summary: SimilaritySummary }) => {
  const flagged = summary.flagged_chunks > 0;
  return (
    <Card className={flagged ? 'border-amber-500/50' : ''}>
      <CardHeader>
        <CardTitle>Similarity report</CardTitle>
        <CardDescription>
          Model {summary.model} • threshold {(summary.threshold * 100).toFixed(0)}% •{' '}
          {summary.flagged_chunks}/{summary.total_chunks} passages flagged • strongest match{' '}
          {(summary.max_score * 100).toFixed(1)}%. Similarity is evidence for a human decision,
          not an automatic verdict.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!flagged && (
          <p className="text-sm text-emerald-400">
            No passages matched the existing corpus above the threshold.
          </p>
        )}
        {summary.report?.passages?.map((passage, i) => (
          <div key={i} className="rounded border border-amber-500/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">
                Passage (chunks {passage.chunk_start}–{passage.chunk_end})
              </p>
              <Badge variant="outline">{(passage.top_score * 100).toFixed(1)}% match</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">In this submission:</p>
                <p className="text-xs bg-muted/40 rounded p-2 line-clamp-6">{passage.passage_text}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Matched source{' '}
                  <a
                    href={`/papers/${passage.matches[0]?.source_submission_id}`}
                    className="underline"
                  >
                    (open paper)
                  </a>
                  :
                </p>
                <p className="text-xs bg-muted/40 rounded p-2 line-clamp-6">
                  {passage.matches[0]?.matched_text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
