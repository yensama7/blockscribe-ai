import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/services/api';

export default function Books() {
  const location = useLocation();
  const queryParam = useMemo(() => new URLSearchParams(location.search).get('q') || '', [location.search]);

  const { data: library = [], isLoading: libraryLoading, error: libraryError } = useQuery({
    queryKey: ['library-metadata'],
    queryFn: api.getAllMetadata,
  });
  const { data: searchResults } = useQuery({
    queryKey: ['title-search', queryParam],
    queryFn: () => api.searchByTitle(queryParam),
    enabled: Boolean(queryParam),
  });

  const books = (queryParam ? searchResults || [] : library).slice().sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Books (A–Z)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {libraryLoading && !queryParam && <p className="text-sm text-muted-foreground">Loading books...</p>}
        {libraryError && !queryParam && <p className="text-sm text-destructive">Could not load books. Check backend on port 5000.</p>}
        {books.map((book) => (
          <div key={book.id} className="flex items-center justify-between rounded border border-border/40 px-3 py-2">
            <div>
              <p className="font-medium">{book.title}</p>
              <p className="text-xs text-muted-foreground">{book.genre} • {book.difficulty}</p>
            </div>
            <Button size="sm" onClick={() => window.open(`https://ipfs.io/ipfs/${book.file_cid}`, '_blank', 'noopener,noreferrer')}>View</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
