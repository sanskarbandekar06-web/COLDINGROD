'use client';

/**
 * OutreachMessageFilters — URL-driven client filter bar
 * All filter application navigates via router.push to trigger server-side re-fetch.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { OUTREACH_PLATFORMS, OUTREACH_STATUSES, OutreachPlatform, OutreachStatus } from '@/types/outreach';
import { X } from 'lucide-react';

const platformLabels: Record<OutreachPlatform, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  sms: 'SMS',
};

const statusLabels: Record<OutreachStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  scheduled: 'Approved / Scheduled',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  replied: 'Replied',
};

interface FiltersProps {
  leads: { id: string; company_name: string }[];
  currentFilters: {
    search?: string;
    status?: OutreachStatus;
    platform?: OutreachPlatform;
    leadId?: string;
    aiGenerated?: boolean;
    archived?: boolean;
  };
  basePath: string;
}

export function OutreachMessageFilters({ leads, currentFilters, basePath }: FiltersProps) {
  const router = useRouter();

  const pushFilters = useCallback(
    (overrides: Partial<typeof currentFilters & { search?: string }>) => {
      const merged = { ...currentFilters, ...overrides };
      const sp = new URLSearchParams();
      if (merged.search) sp.set('search', merged.search);
      if (merged.status) sp.set('status', merged.status);
      if (merged.platform) sp.set('platform', merged.platform);
      if (merged.leadId) sp.set('lead', merged.leadId);
      if (merged.aiGenerated !== undefined) sp.set('ai', String(merged.aiGenerated));
      if (merged.archived) sp.set('archived', 'true');
      router.push(`${basePath}?${sp.toString()}`);
    },
    [currentFilters, basePath, router]
  );

  function clearAll() {
    router.push(basePath);
  }

  const hasFilters =
    currentFilters.search ||
    currentFilters.status ||
    currentFilters.platform ||
    currentFilters.leadId ||
    currentFilters.aiGenerated !== undefined ||
    currentFilters.archived;

  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter outreach messages">
      {/* Search */}
      <Input
        type="search"
        placeholder="Search content…"
        defaultValue={currentFilters.search ?? ''}
        className="h-8 w-48 text-sm"
        aria-label="Search message content"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            pushFilters({ search: (e.target as HTMLInputElement).value });
          }
        }}
      />

      {/* Status filter */}
      <Select
        value={currentFilters.status ?? '__all__'}
        onValueChange={(value) =>
          pushFilters({ status: !value || value === '__all__' ? undefined : (value as OutreachStatus) })
        }
      >
        <SelectTrigger className="h-8 w-44 text-sm" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All statuses</SelectItem>
          {OUTREACH_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {statusLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Channel filter */}
      <Select
        value={currentFilters.platform ?? '__all__'}
        onValueChange={(value) =>
          pushFilters({ platform: !value || value === '__all__' ? undefined : (value as OutreachPlatform) })
        }
      >
        <SelectTrigger className="h-8 w-36 text-sm" aria-label="Filter by channel">
          <SelectValue placeholder="All channels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All channels</SelectItem>
          {OUTREACH_PLATFORMS.map((p) => (
            <SelectItem key={p} value={p}>
              {platformLabels[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Lead filter */}
      <Select
        value={currentFilters.leadId ?? '__all__'}
        onValueChange={(value) =>
          pushFilters({ leadId: !value || value === '__all__' ? undefined : value })
        }
      >
        <SelectTrigger className="h-8 w-44 text-sm" aria-label="Filter by lead">
          <SelectValue placeholder="All leads" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All leads</SelectItem>
          {leads.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.company_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AI filter */}
      <Select
        value={currentFilters.aiGenerated === undefined ? '__all__' : String(currentFilters.aiGenerated)}
        onValueChange={(value) =>
          pushFilters({ aiGenerated: !value || value === '__all__' ? undefined : value === 'true' })
        }
      >
        <SelectTrigger className="h-8 w-36 text-sm" aria-label="Filter by source">
          <SelectValue placeholder="All sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All sources</SelectItem>
          <SelectItem value="true">AI Generated</SelectItem>
          <SelectItem value="false">Manual</SelectItem>
        </SelectContent>
      </Select>

      {/* Archived toggle */}
      <Button
        variant={currentFilters.archived ? 'secondary' : 'outline'}
        size="sm"
        className="h-8 text-xs"
        onClick={() => pushFilters({ archived: !currentFilters.archived })}
        aria-pressed={currentFilters.archived ?? false}
        aria-label="Toggle archived messages"
      >
        Archived
      </Button>

      {/* Clear */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={clearAll}
          aria-label="Clear all filters"
        >
          <X className="h-3 w-3 mr-1" aria-hidden="true" />
          Clear
        </Button>
      )}
    </div>
  );
}
