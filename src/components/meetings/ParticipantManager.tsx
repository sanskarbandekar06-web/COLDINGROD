'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { Loader2, User, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  addMeetingParticipantAction,
  removeMeetingParticipantAction,
} from '@/actions/meeting';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MeetingParticipant,
  MeetingParticipantOption,
} from '@/types/meeting';

interface ParticipantManagerProps {
  meetingId: string;
  workspaceId: string;
  workspaceSlug: string;
  participants: MeetingParticipant[];
  availableMembers: MeetingParticipantOption[];
  canEdit: boolean;
  organizerId: string | null;
}

export function ParticipantManager({
  meetingId,
  workspaceId,
  workspaceSlug,
  participants,
  availableMembers,
  canEdit,
  organizerId,
}: ParticipantManagerProps) {
  const [newParticipantId, setNewParticipantId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const labelsById = useMemo(
    () => new Map(availableMembers.map((member) => [member.id, member.label])),
    [availableMembers]
  );
  const participantIds = useMemo(
    () => new Set(participants.map((participant) => participant.workspace_member_id)),
    [participants]
  );
  const addableMembers = availableMembers.filter(
    (member) => !participantIds.has(member.id)
  );

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newParticipantId) return;

    startTransition(async () => {
      const result = await addMeetingParticipantAction(
        meetingId,
        workspaceId,
        workspaceSlug,
        newParticipantId
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Participant added');
      setNewParticipantId(null);
    });
  };

  const handleRemove = (participantId: string) => {
    startTransition(async () => {
      const result = await removeMeetingParticipantAction(
        meetingId,
        workspaceId,
        workspaceSlug,
        participantId
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Participant removed');
    });
  };

  return (
    <div className="space-y-4">
      {participants.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No participants added yet.
        </p>
      ) : (
        <div className="space-y-3">
          {participants.map((participant) => {
            const participantId = participant.workspace_member_id;
            const isOrganizer = participantId === organizerId;
            const label =
              labelsById.get(participantId) ||
              `Former member ${participantId.slice(0, 6)}…`;

            return (
              <div
                key={participantId}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="truncate text-sm font-medium">
                    {label}
                    {isOrganizer && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                        Organizer
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && !isOrganizer && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(participantId)}
                    disabled={isPending}
                    className="text-red-500 hover:text-red-700"
                    aria-label={`Remove ${label}`}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && addableMembers.length > 0 && (
        <form
          onSubmit={handleAdd}
          className="flex items-center gap-2 border-t pt-4"
        >
          <Select
            value={newParticipantId}
            onValueChange={setNewParticipantId}
            disabled={isPending}
          >
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue placeholder="Select a workspace member" />
            </SelectTrigger>
            <SelectContent>
              {addableMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={isPending || !newParticipantId} size="sm">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Add
          </Button>
        </form>
      )}

      {canEdit && addableMembers.length === 0 && (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Every active workspace member is already included.
        </p>
      )}
    </div>
  );
}
