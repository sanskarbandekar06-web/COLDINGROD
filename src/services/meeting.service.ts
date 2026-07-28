import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  AvailabilitySlot,
  Meeting,
  MeetingParticipant,
} from '@/types/meeting';

export const getWorkspaceMeetings = cache(
  async (workspaceId: string, archived = false): Promise<Meeting[]> => {
    const supabase = await createClient();
    let query = supabase
      .from('meetings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('start_time', { ascending: true });

    query = archived
      ? query.not('deleted_at', 'is', null)
      : query.is('deleted_at', null);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching workspace meetings:', error);
      throw new Error('Failed to fetch workspace meetings.');
    }

    const meetings: Meeting[] = data ?? [];
    return meetings;
  }
);

export const getClientMeetings = cache(
  async (workspaceId: string, clientId: string): Promise<Meeting[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Error fetching client meetings:', error);
      throw new Error('Failed to fetch client meetings.');
    }

    const meetings: Meeting[] = data ?? [];
    return meetings;
  }
);

export const getMeetingById = cache(
  async (
    workspaceId: string,
    meetingId: string,
    allowArchived = false
  ): Promise<Meeting | null> => {
    const supabase = await createClient();
    let query = supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('workspace_id', workspaceId);

    if (!allowArchived) query = query.is('deleted_at', null);

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error('Error fetching meeting by id:', error);
      throw new Error('Failed to fetch meeting.');
    }

    return data;
  }
);

export const getMeetingParticipants = cache(
  async (workspaceId: string, meetingId: string): Promise<MeetingParticipant[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('meeting_participants')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('meeting_id', meetingId);

    if (error) {
      console.error('Error fetching meeting participants:', error);
      throw new Error('Failed to fetch meeting participants.');
    }

    const participants: MeetingParticipant[] = data ?? [];
    return participants;
  }
);

export const getAvailabilitySlots = cache(
  async (
    workspaceId: string,
    startRange?: string,
    endRange?: string
  ): Promise<AvailabilitySlot[]> => {
    const supabase = await createClient();
    let query = supabase
      .from('availability_slots')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (startRange) query = query.gte('end_time', startRange);
    if (endRange) query = query.lte('start_time', endRange);

    const { data, error } = await query.order('start_time', { ascending: true });
    if (error) {
      console.error('Error fetching availability slots:', error);
      throw new Error('Failed to fetch availability slots.');
    }

    const slots: AvailabilitySlot[] = data ?? [];
    return slots;
  }
);

export const getMemberAvailabilitySlots = cache(
  async (
    workspaceId: string,
    memberId: string,
    startRange?: string,
    endRange?: string
  ): Promise<AvailabilitySlot[]> => {
    const supabase = await createClient();
    let query = supabase
      .from('availability_slots')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('workspace_member_id', memberId);

    if (startRange) query = query.gte('end_time', startRange);
    if (endRange) query = query.lte('start_time', endRange);

    const { data, error } = await query.order('start_time', { ascending: true });
    if (error) {
      console.error('Error fetching member availability:', error);
      throw new Error('Failed to fetch member availability.');
    }

    const slots: AvailabilitySlot[] = data ?? [];
    return slots;
  }
);
