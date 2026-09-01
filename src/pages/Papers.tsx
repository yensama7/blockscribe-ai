import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PaperCard } from '@/components/PaperCard';
import { api } from '@/services/api';
import { Search, Sparkles } from 'lucide-react';

export default function Papers() {
  const location = useLocation();
  const urlQuery = useMemo(() => new URLSearchParams(location.search).get('q') || '', [location.search]);
  const [query, setQuery] = useState(urlQuery);
  const [semanticQuery, setSemanticQuery] = useState(urlQuery);

  useEffect(() => {
    setQuery(urlQuery);
    setSemanticQuery(urlQuery);
  }, [urlQuery]);

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
    <div className="space-y-8">
      <header>
        <div className="hero-rule mb-3" />
        <h1 className="font-display text-3xl font-semibold">Research archive</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search by meaning, not just keywords — a query for “drought farming” will surface a maize
          irrigation study even when the words never match.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="e.g. drought tolerance in smallholder farming"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setSemanticQuery(query)}
              className="h-11 pl-9"
            />
          </div>
          <Button className="h-11" onClick={() => setSemanticQuery(query)}>
            <Sparkles className="mr-2 h-4 w-4" /> Search
          </Button>
          {showingSearch && (
            <Button variant="outline" className="h-11" onClick={() => { setSemanticQuery(''); setQuery(''); }}>
              Clear
            </Button>
          )}
        </div>
        {showingSearch && (
          <p className="mt-3 text-xs text-muted-foreground">
            {semantic!.mode === 'semantic' ? 'Semantic results' : 'Keyword results (similarity engine offline)'} for
            {' '}“{semanticQuery}” — {papers.length} match{papers.length === 1 ? '' : 'es'}
          </p>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading archive…</p>}
      {Boolean(error) && (
        <p className="text-sm text-destructive">Could not load the archive. Is the backend running on port 5000?</p>
      )}

      {!isLoading && papers.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="text-sm text-muted-foreground">No papers found.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {papers.map((paper) => <PaperCard key={paper.id} paper={paper} />)}
      </div>
    </div>
  );
}
