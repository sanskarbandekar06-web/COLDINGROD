'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { setGooglePlacesEnabledAction } from '@/actions/integrations';
import { Button } from '@/components/ui/button';

export function IntegrationToggleButton({
  workspaceSlug,
  enabled,
}: {
  workspaceSlug: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={enabled ? 'outline' : 'default'}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await setGooglePlacesEnabledAction(
            workspaceSlug,
            !enabled,
          );
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(
            enabled ? 'Google Places disabled.' : 'Google Places enabled.',
          );
          router.refresh();
        });
      }}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Power className="size-4" aria-hidden="true" />
      )}
      {enabled ? 'Disable' : 'Enable'}
    </Button>
  );
}
