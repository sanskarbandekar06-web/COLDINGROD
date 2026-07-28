import { Badge } from '@/components/ui/badge';
import { OutreachStatus } from '@/types/outreach';

interface OutreachStatusBadgeProps {
  status: OutreachStatus;
  className?: string;
}

const statusConfig: Record<
  OutreachStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_approval: { label: 'Pending Approval', variant: 'outline' },
  scheduled: { label: 'Approved / Scheduled', variant: 'default' },
  sent: { label: 'Sent', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  replied: { label: 'Replied', variant: 'default' },
};

export function OutreachStatusBadge({ status, className }: OutreachStatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: 'secondary' as const };
  return (
    <Badge variant={config.variant} className={className} aria-label={`Status: ${config.label}`}>
      {config.label}
    </Badge>
  );
}
