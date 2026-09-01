import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { api, ReviewerCandidate } from '@/services/api';
import { UserPlus, Check } from 'lucide-react';

// Searchable, expertise-ranked reviewer picker — a combobox rather than a
// dropdown so it scales to a large author pool. Candidates are already ranked
// by relevance then productivity server-side; each shows expertise, publication
// count and portable reputation so a prolific, on-topic reviewer surfaces first.
export const ReviewerPicker = ({
  submissionId,
  versionId,
  label = 'Add a reviewer',
}: {
  submissionId: string;
  versionId: string;
  label?: string;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['reviewer-candidates', submissionId],
    queryFn: () => api.matchReviewers(submissionId),
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: (reviewerId: string) => api.assignReviewer(versionId, reviewerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paper'] });
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      setOpen(false);
      toast({ title: 'Reviewer added', description: 'Assigned and the paper is under review.' });
    },
    onError: (e) =>
      toast({ title: 'Could not add reviewer', description: String(e instanceof Error ? e.message : e), variant: 'destructive' }),
  });

  const candidates: ReviewerCandidate[] = data?.candidates ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <UserPlus className="mr-2 h-4 w-4" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search expertise-matched reviewers…" />
          <CommandList>
            {isLoading && <div className="p-3 text-sm text-muted-foreground">Matching by expertise…</div>}
            {!isLoading && (
              <CommandEmpty>No expertise-matched reviewers with a publication record yet.</CommandEmpty>
            )}
            <CommandGroup>
              {candidates.map((c) => (
                <CommandItem
                  key={c.user_id}
                  value={`${c.display_name} ${c.email}`}
                  onSelect={() => assignMutation.mutate(c.user_id)}
                  disabled={assignMutation.isPending}
                  className="flex flex-col items-start gap-1 py-2"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-medium">{c.display_name}</span>
                    <Badge variant="secondary">{Math.round(c.score * 100)}% match</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.email}</span>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline">{c.publications} publication{c.publications === 1 ? '' : 's'}</Badge>
                    <Badge variant="outline">{c.reputation.reviews_completed} review{c.reputation.reviews_completed === 1 ? '' : 's'} done</Badge>
                    {c.reputation.reviews_completed > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Check className="h-3 w-3" />{Math.round(c.reputation.on_time_rate * 100)}% on time
                      </Badge>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
