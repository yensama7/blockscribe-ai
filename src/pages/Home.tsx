import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { PaperCard } from '@/components/PaperCard';
import { api } from '@/services/api';
import { Archive, ShieldCheck, Search, ScanSearch, GitBranch, Globe, ArrowRight } from 'lucide-react';

const StatusDot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
    <span className={`h-2 w-2 rounded-full ${ok ? 'bg-accent' : 'bg-destructive'}`} />
    {label}
  </span>
);

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Provable authorship',
    body: 'Every deposit is anchored on-chain with an address derived from the file itself. Anyone can verify it — no account, no trust in us.',
  },
  {
    icon: ScanSearch,
    title: 'Similarity screening',
    body: 'Incoming work is compared, meaning-by-meaning, against the whole corpus. Editors see matched passages side by side.',
  },
  {
    icon: Globe,
    title: 'Permanent & open',
    body: 'Files are replicated across IPFS and carry real DOIs and an OAI-PMH feed, so scholarship stays findable and free to read.',
  },
  {
    icon: GitBranch,
    title: 'Full review history',
    body: 'Versions, signed peer reviews, and retractions are all recorded immutably — the complete life of a paper, on the record.',
  },
];

export default function Home() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const { data: status } = useQuery({ queryKey: ['component-status'], queryFn: api.status, refetchInterval: 15000 });
  const { data: recent = [] } = useQuery({ queryKey: ['papers', {}], queryFn: () => api.listPapers() });

  const statItems = stats
    ? [
        { label: 'Papers preserved', value: stats.papers },
        { label: 'On-chain anchors', value: stats.anchored },
        { label: 'Signed reviews', value: stats.reviews },
        { label: 'Researchers', value: stats.users },
      ]
    : [];

  return (
    <div className="space-y-14">
      {/* hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="hero-rule mb-5" />
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-primary">
            {stats?.institution || 'Academic Preservation Repository'}
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.08] text-foreground md:text-5xl">
            Research that is preserved permanently — and provably its authors&apos;.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Blockscribe is preservation infrastructure for African scholarship. Deposit a paper and it
            is replicated across a distributed network, screened for originality, and given a
            tamper-proof timestamp anyone can check. Reading is always free.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/submit"><Archive className="mr-2 h-4 w-4" /> Deposit a paper</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/verify"><ShieldCheck className="mr-2 h-4 w-4" /> Verify a document</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/papers"><Search className="mr-2 h-4 w-4" /> Browse the archive</Link>
            </Button>
          </div>
          {status && (
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-xs font-medium text-foreground">System status</span>
              <StatusDot ok={status.database} label="Catalogue" />
              <StatusDot ok={status.vector_service} label="Similarity engine" />
              <StatusDot ok={status.ipfs} label="IPFS storage" />
              <StatusDot ok={status.solana} label="Blockchain" />
            </div>
          )}
        </div>

        {/* stat panel */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="font-display text-lg font-semibold">By the numbers</p>
          <p className="text-sm text-muted-foreground">Live from this repository.</p>
          <div className="mt-5 grid grid-cols-2 gap-4">
            {statItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-border/70 bg-secondary/40 p-4">
                <p className="font-display text-3xl font-semibold text-primary">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
            {statItems.length === 0 &&
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[86px] animate-pulse rounded-lg border border-border/70 bg-secondary/40" />
              ))}
          </div>
          <div className="divider my-5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            The source of truth is IPFS plus the chain — the search index is a rebuildable cache, never
            a second record of what happened.
          </p>
        </div>
      </section>

      {/* features */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="hero-rule mb-3" />
            <h2 className="font-display text-2xl font-semibold">Why it holds up</h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-5 shadow-card card-hover">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* recent */}
      <section>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="hero-rule mb-3" />
            <h2 className="font-display text-2xl font-semibold">Recent deposits</h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/papers">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing here yet — <Link to="/submit" className="text-primary underline underline-offset-2">be the first to deposit a paper</Link>.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {recent.slice(0, 6).map((paper) => <PaperCard key={paper.id} paper={paper} />)}
          </div>
        )}
      </section>
    </div>
  );
}
