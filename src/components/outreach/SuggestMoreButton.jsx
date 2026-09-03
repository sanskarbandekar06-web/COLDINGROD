'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { suggestMorePersonalizedOutreachAction } from '@/actions/personalized-outreach';
import { Button } from '@/components/ui/button';

export function SuggestMoreButton({ workspaceSlug, messageId }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function suggestMore() {
    startTransition(async () => {
      const result = await suggestMorePersonalizedOutreachAction({
        workspaceSlug,
        messageId,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('A different report-grounded draft is ready for review.');
      router.push(
        `/dashboard/${workspaceSlug}/outreach/messages/${result.messageId}?edit=1`,
      );
    });
  }

  return (
    <Button type="button" variant="outline" onClick={suggestMore} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="size-4" aria-hidden="true" />
      )}
      {pending ? 'Writing a new option…' : 'Suggest more'}
    </Button>
  );
}
