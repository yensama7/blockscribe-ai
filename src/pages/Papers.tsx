import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PaperCard } from '@/components/PaperCard';
import { api } from '@/services/api';
import { Sparkles } from 'lucide-react';

export default function Papers() {
  const location = useLocation();
  const urlQuery = useMemo(() => new URLSearchParams(location.search).get('q') || '', [location.search]);
  const [query, setQuery] = useState(urlQuery);
  const [semanticQuery, setSemanticQuery] = useState(urlQuery);

  const { data: browse = [], isLoading, error } = useQuery({
    queryKey: ['papers', {}],
    queryFn: () => api.listPapers(),
  });

  const { data: semantic } = useQuery({
    queryKey: ['semantic-search', semanticQuery],
    queryFn: () => api.search(semanticQuery),
    enabled: Boolean(semanticQuery.trim()),
  });

  const showingSearch = Boolean(semanticQuery.trim()) && semantic;
  const papers = showingSearch ? semantic!.results : browse;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Research archive</CardTitle>
        <CardDescription>
          Search by meaning, not just keywords — concept queries work even on papers with poor
          metadata.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. drought tolerance in smallholder farming"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSemanticQuery(query)}
          />
          <Button onClick={() => setSemanticQuery(query)}>
            <Sparkles className="mr-2 h-4 w-4" /> Search
          </Button>
          {showingSearch && (
            <Button variant="outline" onClick={() => { setSemanticQuery(''); setQuery(''); }}>
              Clear
            </Button>
          )}
        </div>
        {showingSearch && (
          <p className="text-xs text-muted-foreground">
            {semantic!.mode === 'semantic' ? 'Semantic results' : 'Keyword results (similarity engine offline)'} for
            “{semanticQuery}” — {papers.length} match{papers.length === 1 ? '' : 'es'}
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Loading archive...</p>}
        {Boolean(error) && (
          <p className="text-sm text-destructive">Could not load the archive. Is the backend running on port 5000?</p>
        )}
        {papers.map((paper) => <PaperCard key={paper.id} paper={paper} />)}
        {!isLoading && papers.length === 0 && (
          <p className="text-sm text-muted-foreground">No papers found.</p>
        )}
      </CardContent>
    </Card>
  );
}
