import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MeetingStatus } from '@/types/meeting';

interface MeetingStatusBadgeProps {
  status: MeetingStatus;
}

export function MeetingStatusBadge({ status }: MeetingStatusBadgeProps) {
  const getStatusConfig = (status: MeetingStatus) => {
    switch (status) {
      case 'requested':
        return { label: 'Requested', variant: 'secondary' as const, className: 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20' };
      case 'scheduled':
        return { label: 'Scheduled', variant: 'default' as const, className: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20' };
      case 'in_progress':
        return { label: 'In Progress', variant: 'default' as const, className: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 animate-pulse' };
      case 'completed':
        return { label: 'Completed', variant: 'outline' as const, className: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200' };
      case 'cancelled':
        return { label: 'Cancelled', variant: 'destructive' as const, className: 'bg-red-500/10 text-red-600 hover:bg-red-500/20' };
      case 'no_show':
        return { label: 'No Show', variant: 'destructive' as const, className: 'bg-gray-500/10 text-gray-600 hover:bg-gray-500/20' };
      default:
        return { label: status, variant: 'secondary' as const, className: '' };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
