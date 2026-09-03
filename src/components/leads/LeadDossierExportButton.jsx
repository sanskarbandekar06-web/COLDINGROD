'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

function filenameFrom(response) {
  const header = response.headers.get('content-disposition') ?? '';
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1] || 'coldingrod-confirmed-leads.docx';
}

export function LeadDossierExportButton({ workspaceSlug, selectedLeadIds, disabled = false }) {
  const [exporting, setExporting] = useState(false);

  async function download() {
    if (!selectedLeadIds.length) {
      toast.error('Select at least one lead to export.');
      return;
    }
    setExporting(true);
    try {
      const search = new URLSearchParams();
      for (const leadId of selectedLeadIds) search.append('leadId', leadId);
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceSlug)}/leads/export?${search.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'The lead dossier could not be generated.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filenameFrom(response);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Shareable Word dossier created for ${selectedLeadIds.length} lead${selectedLeadIds.length === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The lead dossier could not be generated.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={download}
      disabled={disabled || exporting || selectedLeadIds.length === 0}
    >
      {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      {exporting ? 'Creating DOCX…' : `Export selected${selectedLeadIds.length ? ` (${selectedLeadIds.length})` : ''}`}
    </Button>
  );
}
