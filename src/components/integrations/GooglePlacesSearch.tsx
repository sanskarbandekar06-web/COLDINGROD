'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Clipboard,
  ExternalLink,
  Mail,
  Loader2,
  MapPin,
  Phone,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { searchGooglePlacesAction } from '@/actions/integrations';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GooglePlacesSearchResult } from '@/types/integration';

export function GooglePlacesSearch({
  workspaceSlug,
  enabled,
  configured,
}: {
  workspaceSlug: string;
  enabled: boolean;
  configured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState('10');
  const [results, setResults] = useState<GooglePlacesSearchResult[]>([]);
  const operational = enabled && configured;

  function search() {
    startTransition(async () => {
      const result = await searchGooglePlacesAction({
        workspaceSlug,
        query,
        pageSize: Number(pageSize),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setResults(result.results);
      toast.success(
        result.results.length === 0
          ? 'No matching places returned.'
          : `${result.results.length} places found.`,
      );
    });
  }

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4 text-blue-600" aria-hidden="true" />
              Google Places search
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Find businesses and carry verified public contact destinations
              into the human-reviewed lead intake.
            </p>
          </div>
          <Badge variant={operational ? 'default' : 'outline'}>
            {operational
              ? 'Ready'
              : enabled
                ? 'API key required'
                : 'Disabled'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!operational ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {enabled
              ? 'The workspace is enabled, but the server environment does not yet contain GOOGLE_PLACES_API_KEY.'
              : 'Enable Google Places from the Integrations page before using live search.'}
            <Link
              href={`/dashboard/${workspaceSlug}/integrations`}
              className="ml-2 font-medium underline underline-offset-4"
            >
              Open integrations
            </Link>
          </div>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              search();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="places-query">Business and location</Label>
              <Input
                id="places-query"
                value={query}
                minLength={3}
                maxLength={200}
                required
                disabled={pending}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Dental clinics in Pune"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="places-count">Results</Label>
              <Select
                value={pageSize}
                onValueChange={(value) => setPageSize(value ?? '10')}
              >
                <SelectTrigger id="places-count" className="w-full">
                  <SelectValue>{pageSize}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {['5', '10', '15', '20'].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              Search
            </Button>
          </form>
        )}

        {results.length > 0 && (
          <div className="space-y-3 rounded-xl border bg-muted/15 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              {results.map((place) => (
                <div key={place.placeId} className="rounded-lg border bg-card p-4">
                  <p className="font-medium">{place.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {place.address}
                  </p>
                  {(place.phone || place.email) && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {place.phone && <p className="flex items-center gap-2"><Phone className="size-3.5" aria-hidden="true" />{place.phone}</p>}
                      {place.email && <p className="flex items-center gap-2"><Mail className="size-3.5" aria-hidden="true" />{place.email}</p>}
                    </div>
                  )}
                  {(place.linkedinUrl || place.instagramHandle || place.facebookUrl) && (
                    <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Public social destinations found
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await navigator.clipboard.writeText(place.placeId);
                        toast.success('Google Place ID copied.');
                      }}
                    >
                      <Clipboard className="size-4" aria-hidden="true" />
                      Copy Place ID
                    </Button>
                    <a
                      href={place.googleMapsUri}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({
                        variant: 'ghost',
                        size: 'sm',
                      })}
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      Verify on Maps
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <p
              className="text-xs text-[#5e5e5e] dark:text-gray-300"
              translate="no"
            >
              Google Maps
            </p>
            <p className="text-xs text-muted-foreground">
              Results are ranked by Google using factors such as relevance,
              distance, and prominence. Nothing becomes a lead until you
              review and import it. Verified website, phone, email, and public
              social destinations are preserved for outreach.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
