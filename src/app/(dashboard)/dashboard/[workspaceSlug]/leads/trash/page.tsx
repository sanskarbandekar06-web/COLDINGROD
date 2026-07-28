import { getWorkspaceContext } from '@/services/workspace.service';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { TrashTable } from '@/components/leads/TrashTable';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function LeadsTrashPage(props: { params: Promise<{ workspaceSlug: string }> }) {
  const params = await props.params;
  const context = await getWorkspaceContext(params.workspaceSlug);
  if (!context) {
    notFound();
  }

  const supabase = await createClient();
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', context.workspace.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.location.href = `/dashboard/${params.workspaceSlug}/leads`}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader 
          title="Trash" 
          description="Soft-deleted leads can be restored here." 
        />
      </div>

      <TrashTable leads={leads as any || []} workspaceId={context.workspace.id} />
    </div>
  );
}
