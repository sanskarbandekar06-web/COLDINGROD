'use client';

import { useTransition } from 'react';
import { changeLeadStatus } from '@/actions/lead';
import { LeadStatus } from '@/types/lead';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LeadStatusSelector({
  leadId,
  workspaceId,
  currentStatus
}: {
  leadId: string;
  workspaceId: string;
  currentStatus: LeadStatus;
}) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (value: LeadStatus | null) => {
    if (!value) return;
    startTransition(async () => {
      await changeLeadStatus(workspaceId, leadId, value);
    });
  };

  return (
    <Select 
      value={currentStatus} 
      onValueChange={handleStatusChange}
      disabled={isPending}
    >
      <SelectTrigger className="w-[180px] bg-background">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="new">New</SelectItem>
        <SelectItem value="analyzed">Analyzed</SelectItem>
        <SelectItem value="contacted">Contacted</SelectItem>
        <SelectItem value="responded">Responded</SelectItem>
        <SelectItem value="meeting_scheduled">Meeting Scheduled</SelectItem>
        <SelectItem value="won">Won</SelectItem>
        <SelectItem value="lost">Lost</SelectItem>
      </SelectContent>
    </Select>
  );
}
