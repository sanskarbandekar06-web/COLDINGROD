'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { FileSearch, LoaderCircle, Search } from 'lucide-react';
import { searchWorkspaceAction, type WorkspaceSearchResult } from '@/actions/workspace-search';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function WorkspaceSearch({ workspaceId, workspaceSlug }: { workspaceId: string; workspaceSlug: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const response = await searchWorkspaceAction({ workspaceId, workspaceSlug, query });
        setResults(response.results);
        setError(response.error ?? null);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, workspaceId, workspaceSlug]);

  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Search workspace" title="Search workspace (Ctrl+K)">
        <Search className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Search workspace</DialogTitle>
            <DialogDescription>Find leads, clients, projects, tasks, meetings, and assets.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type at least two characters…" className="pl-9" />
          </div>
          <div className="max-h-80 min-h-36 overflow-y-auto rounded-lg border">
            {pending && query.trim().length >= 2 ? (
              <div className="flex h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Searching…</div>
            ) : query.trim().length >= 2 && error ? (
              <div className="flex h-36 items-center justify-center text-sm text-destructive">{error}</div>
            ) : query.trim().length < 2 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">Start typing to search the workspace.</div>
            ) : results.length === 0 ? (
              <div className="flex h-36 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><FileSearch className="size-5" /> No matching records found.</div>
            ) : (
              <div className="divide-y">
                {results.map((result) => (
                  <Link key={`${result.type}-${result.id}`} href={result.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-4 p-3 transition-colors hover:bg-muted">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{result.title}</p><p className="truncate text-xs capitalize text-muted-foreground">{result.subtitle || 'No additional details'}</p></div>
                    <span className="shrink-0 rounded-full bg-brand-indigo-soft px-2 py-1 text-[10px] font-bold uppercase text-brand-indigo">{result.type}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
