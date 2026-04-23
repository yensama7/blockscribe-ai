import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/services/api';

export default function HotBooks() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['library-highlights'],
    queryFn: api.getLibraryHighlights,
  });

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {isLoading && <p className="text-sm text-muted-foreground md:col-span-3">Loading highlights...</p>}
      {error && <p className="text-sm text-destructive md:col-span-3">Could not load highlights. Check backend on port 5000.</p>}

      <Card>
        <CardHeader><CardTitle>Top searched</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.top_searched.map((book) => <p key={book.id} className="text-sm">{book.title}</p>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.recent.map((book) => <p key={book.id} className="text-sm">{book.title}</p>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Random</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data?.random.map((book) => <p key={book.id} className="text-sm">{book.title}</p>)}
        </CardContent>
      </Card>
    </div>
  );
}
