import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Paper } from '@/services/api';
import { FileText } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  submitted: 'border-slate-300 bg-slate-100 text-slate-700',
  under_review: 'border-amber-300 bg-amber-100 text-amber-800',
  reviewed: 'border-sky-300 bg-sky-100 text-sky-800',
  published: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  retracted: 'border-red-300 bg-red-100 text-red-800',
  superseded: 'border-purple-300 bg-purple-100 text-purple-800',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant="outline" className={`capitalize ${STATUS_STYLES[status] || ''}`}>
    {status.replace('_', ' ')}
  </Badge>
);

export const PaperCard = ({ paper }: { paper: Paper }) => (
  <Link
    to={`/papers/${paper.id}`}
    className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-card card-hover"
  >
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileText className="h-4 w-4" />
      </span>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge status={paper.status} />
        {!paper.full_text_available && <Badge variant="secondary" className="text-[10px]">metadata only</Badge>}
      </div>
    </div>

    <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-foreground group-hover:text-primary">
      {paper.title}
    </h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {paper.authors || paper.author_name || 'Unknown authors'}
    </p>
    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{paper.abstract}</p>

    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
      {paper.discipline && <span className="font-medium text-foreground/80">{paper.discipline}</span>}
      <span>v{paper.version_no}</span>
      {paper.doi && <span className="truncate">DOI {paper.doi}</span>}
      {typeof paper.score === 'number' && (
        <span className="ml-auto rounded bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
          {(paper.score * 100).toFixed(0)}% match
        </span>
      )}
    </div>
  </Link>
);
