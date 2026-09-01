import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Paper } from '@/services/api';

const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-slate-500/20 text-slate-300',
  under_review: 'bg-amber-500/20 text-amber-300',
  reviewed: 'bg-sky-500/20 text-sky-300',
  published: 'bg-emerald-500/20 text-emerald-300',
  retracted: 'bg-red-500/20 text-red-300',
  superseded: 'bg-purple-500/20 text-purple-300',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant="outline" className={STATUS_STYLES[status] || ''}>
    {status.replace('_', ' ')}
  </Badge>
);

export const PaperCard = ({ paper }: { paper: Paper }) => (
  <div className="rounded border border-border/40 px-4 py-3 hover:border-border transition-colors">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link to={`/papers/${paper.id}`} className="font-medium hover:underline">
          {paper.title}
        </Link>
        <p className="text-xs text-muted-foreground mt-1">
          {paper.authors || paper.author_name || 'Unknown authors'}
          {paper.institution && ` • ${paper.institution}`}
        </p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{paper.abstract}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {paper.discipline} • v{paper.version_no} • DOI {paper.doi}
          {typeof paper.score === 'number' && ` • relevance ${(paper.score * 100).toFixed(0)}%`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={paper.status} />
        {!paper.full_text_available && <Badge variant="secondary">metadata only</Badge>}
      </div>
    </div>
  </div>
);
