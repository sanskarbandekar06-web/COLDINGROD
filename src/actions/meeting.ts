'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  MEETING_STATUSES,
  type MeetingStatus,
} from '@/types/meeting';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface ActionResult {
  success?: boolean;
  error?: string;
  code?: string;
  meetingId?: string;
}

interface WorkspaceActor {
  userId: string;
  memberId: string;
  workspaceSlug: string;
}

interface MeetingSchedule {
  startTime: string | null;
  endTime: string | null;
  timezone: string;
}

const MUTABLE_MEETING_STATUSES: MeetingStatus[] = ['requested', 'scheduled'];
const TIMED_MEETING_STATUSES: MeetingStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'no_show',
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getTrimmedFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function validateOptionalUrl(value: string): string | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Meeting link must be a valid URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Meeting link must use HTTP or HTTPS.');
  }

  return url.toString();
}

function validateMeetingText(formData: FormData) {
  const title = getTrimmedFormValue(formData, 'title');
  const description = getTrimmedFormValue(formData, 'description');
  const location = getTrimmedFormValue(formData, 'location');
  const meetLink = validateOptionalUrl(getTrimmedFormValue(formData, 'meetLink'));

  if (!title) throw new Error('Meeting title is required.');
  if (title.length > 200) throw new Error('Meeting title must be 200 characters or fewer.');
  if (description.length > 5000) {
    throw new Error('Meeting description must be 5,000 characters or fewer.');
  }
  if (location.length > 500) {
    throw new Error('Meeting location must be 500 characters or fewer.');
  }

  return {
    title,
    description: description || null,
    location: location || null,
    meetLink,
  };
}

function parseMeetingSchedule(formData: FormData): MeetingSchedule {
  const date = getTrimmedFormValue(formData, 'date');
  const start = getTrimmedFormValue(formData, 'startTime');
  const end = getTrimmedFormValue(formData, 'endTime');
  const timezone = getTrimmedFormValue(formData, 'timezone') || 'UTC';
  const suppliedCount = [date, start, end].filter(Boolean).length;

  if (suppliedCount === 0) {
    return { startTime: null, endTime: null, timezone };
  }
  if (suppliedCount !== 3) {
    throw new Error('Date, start time, and end time must be provided together.');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error('Invalid meeting timezone.');
  }

  // The current UI intentionally records UTC. A future timezone picker should
  // convert local wall-clock values before submitting them.
  if (timezone !== 'UTC') {
    throw new Error('Only UTC scheduling is supported by the current meeting form.');
  }

  const startDate = new Date(`${date}T${start}:00.000Z`);
  const endDate = new Date(`${date}T${end}:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid meeting date or time.');
  }
  if (endDate <= startDate) {
    throw new Error('Meeting end time must be after its start time.');
  }

  return {
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    timezone,
  };
}

function isMeetingStatus(value: string): value is MeetingStatus {
  return MEETING_STATUSES.some((status) => status === value);
}

async function requireActiveWorkspaceMember(
  supabase: SupabaseServerClient,
  workspaceId: string
): Promise<WorkspaceActor> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Not authenticated.');

  const [{ data: member, error: memberError }, { data: workspace, error: workspaceError }] =
    await Promise.all([
      supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('workspaces')
        .select('slug')
        .eq('id', workspaceId)
        .is('deleted_at', null)
        .maybeSingle(),
    ]);

  if (memberError || !member || workspaceError || !workspace) {
    throw new Error('Active workspace membership is required.');
  }

  return {
    userId: user.id,
    memberId: member.id,
    workspaceSlug: workspace.slug,
  };
}

async function hasMeetingManagerPermission(
  supabase: SupabaseServerClient,
  workspaceId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_workspace_permission', {
    check_workspace_id: workspaceId,
    req_permission: 'manage_meetings',
  });
  if (error) throw new Error('Unable to verify meeting permissions.');
  return data === true;
}

async function requireMeetingManager(
  supabase: SupabaseServerClient,
  workspaceId: string
): Promise<WorkspaceActor> {
  const actor = await requireActiveWorkspaceMember(supabase, workspaceId);
  if (!(await hasMeetingManagerPermission(supabase, workspaceId))) {
    throw new Error('The manage_meetings permission is required.');
  }
  return actor;
}

async function validateRelatedEntities(
  supabase: SupabaseServerClient,
  workspaceId: string,
  clientId: string | null,
  leadId: string | null,
  projectId: string | null
): Promise<void> {
  const checks = [
    { table: 'clients', id: clientId, code: 'INVALID_CLIENT' },
    { table: 'leads', id: leadId, code: 'INVALID_LEAD' },
    { table: 'projects', id: projectId, code: 'INVALID_PROJECT' },
  ] as const;

  for (const check of checks) {
    if (!check.id) continue;
    const { data, error } = await supabase
      .from(check.table)
      .select('id')
      .eq('id', check.id)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Unable to validate ${check.table}.`);
    if (!data) {
      const validationError = new Error(check.code);
      validationError.name = check.code;
      throw validationError;
    }
  }
}

async function checkConflict(
  supabase: SupabaseServerClient,
  workspaceId: string,
  memberId: string,
  startTime: string,
  endTime: string,
  excludeMeetingId?: string
): Promise<boolean> {
  let query = supabase
    .from('meetings')
    .select('id, organizer_id')
    .eq('workspace_id', workspaceId)
    .in('status', ['scheduled', 'in_progress'])
    .is('deleted_at', null)
    .not('start_time', 'is', null)
    .not('end_time', 'is', null)
    .lt('start_time', endTime)
    .gt('end_time', startTime);

  if (excludeMeetingId) query = query.neq('id', excludeMeetingId);

  const { data, error } = await query;
  if (error) throw new Error('Unable to check meeting conflicts.');

  const overlappingMeetings: Array<{ id: string; organizer_id: string | null }> = data ?? [];
  if (overlappingMeetings.some((meeting) => meeting.organizer_id === memberId)) {
    return true;
  }

  const meetingIds = overlappingMeetings.map((meeting) => meeting.id);
  if (meetingIds.length === 0) return false;

  const { data: participantRows, error: participantError } = await supabase
    .from('meeting_participants')
    .select('meeting_id')
    .eq('workspace_id', workspaceId)
    .eq('workspace_member_id', memberId)
    .in('meeting_id', meetingIds)
    .limit(1);
  if (participantError) throw new Error('Unable to check participant conflicts.');

  return Boolean(participantRows?.length);
}

async function recordActivity(
  supabase: SupabaseServerClient,
  input: {
    workspaceId: string;
    entityType: string;
    entityId: string;
    userId: string;
    memberId: string;
    action: string;
    metadata?: Record<string, string | null>;
  }
): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    workspace_id: input.workspaceId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_type: 'human',
    actor_user_id: input.userId,
    workspace_member_id: input.memberId,
    action: input.action,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error('The change was saved, but its activity record failed.');
}

function revalidateMeetings(workspaceSlug: string, meetingId?: string): void {
  revalidatePath(`/dashboard/${workspaceSlug}/meetings`);
  if (meetingId) {
    revalidatePath(`/dashboard/${workspaceSlug}/meetings/${meetingId}`);
  }
}

function validationCode(error: unknown): string | undefined {
  return error instanceof Error && error.name.startsWith('INVALID_')
    ? error.name
    : undefined;
}

export async function createMeetingAction(
  workspaceId: string,
  _workspaceSlug: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const actor = await requireMeetingManager(supabase, workspaceId);
    const text = validateMeetingText(formData);
    const schedule = parseMeetingSchedule(formData);
    const clientId = getTrimmedFormValue(formData, 'clientId') || null;
    const leadId = getTrimmedFormValue(formData, 'leadId') || null;
    const projectId = getTrimmedFormValue(formData, 'projectId') || null;

    await validateRelatedEntities(supabase, workspaceId, clientId, leadId, projectId);
    if (
      schedule.startTime &&
      schedule.endTime &&
      (await checkConflict(
        supabase,
        workspaceId,
        actor.memberId,
        schedule.startTime,
        schedule.endTime
      ))
    ) {
      return { error: 'Schedule conflict detected for this time.', code: 'SCHEDULE_CONFLICT' };
    }

    const status: MeetingStatus = schedule.startTime ? 'scheduled' : 'requested';
    const { data: meeting, error } = await supabase
      .from('meetings')
      .insert({
        workspace_id: workspaceId,
        organizer_id: actor.memberId,
        title: text.title,
        description: text.description,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        timezone: schedule.timezone,
        location: text.location,
        meet_link: text.meetLink,
        client_id: clientId,
        lead_id: leadId,
        project_id: projectId,
        status,
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (error || !meeting) throw new Error('Failed to create meeting.');

    const { error: participantError } = await supabase.from('meeting_participants').insert({
      meeting_id: meeting.id,
      workspace_id: workspaceId,
      workspace_member_id: actor.memberId,
    });
    if (participantError) throw new Error('Failed to add the meeting organizer.');

    await recordActivity(supabase, {
      workspaceId,
      entityType: 'meeting',
      entityId: meeting.id,
      userId: actor.userId,
      memberId: actor.memberId,
      action: status === 'scheduled' ? 'scheduled' : 'requested',
      metadata: { status },
    });

    revalidateMeetings(actor.workspaceSlug, meeting.id);
    return { success: true, meetingId: meeting.id };
  } catch (error: unknown) {
    console.error('Create meeting error:', error);
    return {
      error: getErrorMessage(error, 'Failed to create meeting.'),
      code: validationCode(error),
    };
  }
}

export async function updateMeetingStatusAction(
  meetingId: string,
  _workspaceSlug: string,
  newStatus: MeetingStatus
): Promise<ActionResult> {
  try {
    if (!isMeetingStatus(newStatus)) throw new Error('Invalid meeting status.');

    const supabase = await createClient();
    const { data: meeting, error: fetchError } = await supabase
      .from('meetings')
      .select('workspace_id, status, start_time, end_time')
      .eq('id', meetingId)
      .is('deleted_at', null)
      .maybeSingle();
    if (fetchError || !meeting) throw new Error('Meeting not found.');

    const actor = await requireMeetingManager(supabase, meeting.workspace_id);
    if (!isMeetingStatus(meeting.status)) throw new Error('Meeting has an invalid status.');
    const currentStatus = meeting.status;
    const allowedTransitions: Record<MeetingStatus, MeetingStatus[]> = {
      requested: ['scheduled', 'cancelled'],
      scheduled: ['in_progress', 'completed', 'cancelled', 'no_show'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
      no_show: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}.`);
    }
    if (TIMED_MEETING_STATUSES.includes(newStatus) && (!meeting.start_time || !meeting.end_time)) {
      throw new Error(`Status ${newStatus} requires start and end times.`);
    }

    const { error } = await supabase
      .from('meetings')
      .update({ status: newStatus })
      .eq('id', meetingId)
      .eq('workspace_id', meeting.workspace_id)
      .is('deleted_at', null);
    if (error) throw new Error('Failed to update meeting status.');

    await recordActivity(supabase, {
      workspaceId: meeting.workspace_id,
      entityType: 'meeting',
      entityId: meetingId,
      userId: actor.userId,
      memberId: actor.memberId,
      action: 'status_changed',
      metadata: { from: currentStatus, to: newStatus },
    });

    revalidateMeetings(actor.workspaceSlug, meetingId);
    return { success: true };
  } catch (error: unknown) {
    console.error('Update meeting status error:', error);
    return { error: getErrorMessage(error, 'Failed to update meeting status.') };
  }
}

export async function archiveMeetingAction(
  meetingId: string,
  _workspaceSlug: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: meeting, error: fetchError } = await supabase
      .from('meetings')
      .select('workspace_id')
      .eq('id', meetingId)
      .is('deleted_at', null)
      .maybeSingle();
    if (fetchError || !meeting) throw new Error('Meeting not found.');

    const actor = await requireMeetingManager(supabase, meeting.workspace_id);
    const { error } = await supabase
      .from('meetings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', meetingId)
      .eq('workspace_id', meeting.workspace_id)
      .is('deleted_at', null);
    if (error) throw new Error('Failed to archive meeting.');

    await recordActivity(supabase, {
      workspaceId: meeting.workspace_id,
      entityType: 'meeting',
      entityId: meetingId,
      userId: actor.userId,
      memberId: actor.memberId,
      action: 'archived',
    });
    revalidateMeetings(actor.workspaceSlug, meetingId);
    return { success: true };
  } catch (error: unknown) {
    console.error('Archive meeting error:', error);
    return { error: getErrorMessage(error, 'Failed to archive meeting.') };
  }
}

export async function restoreMeetingAction(
  meetingId: string,
  _workspaceSlug: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: meeting, error: fetchError } = await supabase
      .from('meetings')
      .select('workspace_id')
      .eq('id', meetingId)
      .not('deleted_at', 'is', null)
      .maybeSingle();
    if (fetchError || !meeting) throw new Error('Archived meeting not found.');

    const actor = await requireMeetingManager(supabase, meeting.workspace_id);
    const { error } = await supabase
      .from('meetings')
      .update({ deleted_at: null })
      .eq('id', meetingId)
      .eq('workspace_id', meeting.workspace_id)
      .not('deleted_at', 'is', null);
    if (error) throw new Error('Failed to restore meeting.');

    await recordActivity(supabase, {
      workspaceId: meeting.workspace_id,
      entityType: 'meeting',
      entityId: meetingId,
      userId: actor.userId,
      memberId: actor.memberId,
      action: 'restored',
    });
    revalidateMeetings(actor.workspaceSlug, meetingId);
    return { success: true };
  } catch (error: unknown) {
    console.error('Restore meeting error:', error);
    return { error: getErrorMessage(error, 'Failed to restore meeting.') };
  }
}

function validateAvailabilityWindow(startTime: string, endTime: string): void {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid availability date or time.');
  }
  if (end <= start) throw new Error('Availability end time must be after its start time.');
}

async function hasAvailabilityOverlap(
  supabase: SupabaseServerClient,
  workspaceId: string,
  memberId: string,
  startTime: string,
  endTime: string,
  excludeSlotId?: string
): Promise<boolean> {
  let query = supabase
    .from('availability_slots')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('workspace_member_id', memberId)
    .lt('start_time', endTime)
    .gt('end_time', startTime);
  if (excludeSlotId) query = query.neq('id', excludeSlotId);

  const { data, error } = await query.limit(1);
  if (error) throw new Error('Unable to check availability overlaps.');
  return Boolean(data?.length);
}

export async function createAvailabilitySlotAction(
  workspaceId: string,
  _workspaceSlug: string,
  startTime: string,
  endTime: string
): Promise<ActionResult> {
  try {
    validateAvailabilityWindow(startTime, endTime);
    const supabase = await createClient();
    const actor = await requireActiveWorkspaceMember(supabase, workspaceId);
    if (
      await hasAvailabilityOverlap(
        supabase,
        workspaceId,
        actor.memberId,
        startTime,
        endTime
      )
    ) {
      return { error: 'This availability overlaps an existing slot.', code: 'OVERLAP_ERROR' };
    }

    const { error } = await supabase.from('availability_slots').insert({
      workspace_id: workspaceId,
      workspace_member_id: actor.memberId,
      start_time: startTime,
      end_time: endTime,
    });
    if (error) throw new Error('Failed to create availability slot.');

    revalidateMeetings(actor.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Create availability slot error:', error);
    return { error: getErrorMessage(error, 'Failed to create availability slot.') };
  }
}

export async function updateAvailabilitySlotAction(
  slotId: string,
  workspaceId: string,
  _workspaceSlug: string,
  startTime: string,
  endTime: string
): Promise<ActionResult> {
  try {
    validateAvailabilityWindow(startTime, endTime);
    const supabase = await createClient();
    const actor = await requireActiveWorkspaceMember(supabase, workspaceId);
    const { data: slot, error: slotError } = await supabase
      .from('availability_slots')
      .select('id, workspace_member_id')
      .eq('id', slotId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (slotError || !slot) throw new Error('Availability slot not found.');

    const canManage = await hasMeetingManagerPermission(supabase, workspaceId);
    if (slot.workspace_member_id !== actor.memberId && !canManage) {
      throw new Error('You can only update your own availability.');
    }
    if (
      await hasAvailabilityOverlap(
        supabase,
        workspaceId,
        slot.workspace_member_id,
        startTime,
        endTime,
        slotId
      )
    ) {
      return { error: 'This availability overlaps an existing slot.', code: 'OVERLAP_ERROR' };
    }

    const { error } = await supabase
      .from('availability_slots')
      .update({ start_time: startTime, end_time: endTime })
      .eq('id', slotId)
      .eq('workspace_id', workspaceId)
      .eq('workspace_member_id', slot.workspace_member_id);
    if (error) throw new Error('Failed to update availability slot.');

    revalidateMeetings(actor.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Update availability slot error:', error);
    return { error: getErrorMessage(error, 'Failed to update availability slot.') };
  }
}

export async function deleteAvailabilitySlotAction(
  slotId: string,
  _workspaceSlug: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: slot, error: slotError } = await supabase
      .from('availability_slots')
      .select('workspace_id, workspace_member_id')
      .eq('id', slotId)
      .maybeSingle();
    if (slotError || !slot) throw new Error('Availability slot not found.');

    const actor = await requireActiveWorkspaceMember(supabase, slot.workspace_id);
    const canManage = await hasMeetingManagerPermission(supabase, slot.workspace_id);
    if (slot.workspace_member_id !== actor.memberId && !canManage) {
      throw new Error('You can only delete your own availability.');
    }

    const { error } = await supabase
      .from('availability_slots')
      .delete()
      .eq('id', slotId)
      .eq('workspace_id', slot.workspace_id)
      .eq('workspace_member_id', slot.workspace_member_id);
    if (error) throw new Error('Failed to delete availability slot.');

    revalidateMeetings(actor.workspaceSlug);
    return { success: true };
  } catch (error: unknown) {
    console.error('Delete availability slot error:', error);
    return { error: getErrorMessage(error, 'Failed to delete availability slot.') };
  }
}

export async function updateMeetingAction(
  meetingId: string,
  workspaceId: string,
  _workspaceSlug: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const actor = await requireMeetingManager(supabase, workspaceId);
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('status, organizer_id')
      .eq('id', meetingId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (meetingError || !meeting) throw new Error('Meeting not found.');
    if (!isMeetingStatus(meeting.status) || !MUTABLE_MEETING_STATUSES.includes(meeting.status)) {
      throw new Error('Only requested or scheduled meetings can be edited.');
    }
    if (!meeting.organizer_id) {
      throw new Error('Meeting organizer is no longer active; assign an organizer before editing.');
    }

    const text = validateMeetingText(formData);
    const schedule = parseMeetingSchedule(formData);
    const clientId = getTrimmedFormValue(formData, 'clientId') || null;
    const leadId = getTrimmedFormValue(formData, 'leadId') || null;
    const projectId = getTrimmedFormValue(formData, 'projectId') || null;
    await validateRelatedEntities(supabase, workspaceId, clientId, leadId, projectId);

    if (
      schedule.startTime &&
      schedule.endTime &&
      (await checkConflict(
        supabase,
        workspaceId,
        meeting.organizer_id,
        schedule.startTime,
        schedule.endTime,
        meetingId
      ))
    ) {
      return { error: 'Schedule conflict detected for this time.', code: 'SCHEDULE_CONFLICT' };
    }

    const status: MeetingStatus = schedule.startTime ? 'scheduled' : 'requested';
    const { error } = await supabase
      .from('meetings')
      .update({
        title: text.title,
        description: text.description,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        timezone: schedule.timezone,
        location: text.location,
        meet_link: text.meetLink,
        client_id: clientId,
        lead_id: leadId,
        project_id: projectId,
        status,
      })
      .eq('id', meetingId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);
    if (error) throw new Error('Failed to update meeting.');

    await recordActivity(supabase, {
      workspaceId,
      entityType: 'meeting',
      entityId: meetingId,
      userId: actor.userId,
      memberId: actor.memberId,
      action: 'updated',
      metadata: { status },
    });

    revalidateMeetings(actor.workspaceSlug, meetingId);
    return { success: true };
  } catch (error: unknown) {
    console.error('Update meeting error:', error);
    return {
      error: getErrorMessage(error, 'Failed to update meeting.'),
      code: validationCode(error),
    };
  }
}

export async function addMeetingParticipantAction(
  meetingId: string,
  workspaceId: string,
  _workspaceSlug: string,
  participantMemberId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const actor = await requireMeetingManager(supabase, workspaceId);
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('status, start_time, end_time')
      .eq('id', meetingId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (meetingError || !meeting) throw new Error('Meeting not found.');
    if (!isMeetingStatus(meeting.status) || !MUTABLE_MEETING_STATUSES.includes(meeting.status)) {
      throw new Error('Participants can only change on requested or scheduled meetings.');
    }

    const { data: participant, error: participantError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('id', participantMemberId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (participantError || !participant) {
      throw new Error('Target participant is not an active workspace member.');
    }

    const { data: existing, error: existingError } = await supabase
      .from('meeting_participants')
      .select('meeting_id')
      .eq('meeting_id', meetingId)
      .eq('workspace_id', workspaceId)
      .eq('workspace_member_id', participantMemberId)
      .maybeSingle();
    if (existingError) throw new Error('Unable to validate the participant.');
    if (existing) return { error: 'Participant is already on this meeting.', code: 'DUPLICATE_PARTICIPANT' };

    if (
      meeting.start_time &&
      meeting.end_time &&
      (await checkConflict(
        supabase,
        workspaceId,
        participantMemberId,
        meeting.start_time,
        meeting.end_time,
        meetingId
      ))
    ) {
      return { error: 'Participant has a conflicting meeting.', code: 'SCHEDULE_CONFLICT' };
    }

    const { error } = await supabase.from('meeting_participants').insert({
      meeting_id: meetingId,
      workspace_id: workspaceId,
      workspace_member_id: participantMemberId,
    });
    if (error) throw new Error('Failed to add participant.');

    await recordActivity(supabase, {
      workspaceId,
      entityType: 'meeting',
      entityId: meetingId,
      userId: actor.userId,
      memberId: actor.memberId,
      action: 'participant_added',
      metadata: { participant_member_id: participantMemberId },
    });
    revalidateMeetings(actor.workspaceSlug, meetingId);
    return { success: true };
  } catch (error: unknown) {
    console.error('Add participant error:', error);
    return { error: getErrorMessage(error, 'Failed to add participant.') };
  }
}

export async function removeMeetingParticipantAction(
  meetingId: string,
  workspaceId: string,
  _workspaceSlug: string,
  participantMemberId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const actor = await requireMeetingManager(supabase, workspaceId);
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('status, organizer_id')
      .eq('id', meetingId)
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .maybeSingle();
    if (meetingError || !meeting) throw new Error('Meeting not found.');
    if (!isMeetingStatus(meeting.status) || !MUTABLE_MEETING_STATUSES.includes(meeting.status)) {
      throw new Error('Participants can only change on requested or scheduled meetings.');
    }
    if (meeting.organizer_id === participantMemberId) {
      throw new Error('The meeting organizer cannot be removed.');
    }

    const { error } = await supabase
      .from('meeting_participants')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('workspace_id', workspaceId)
      .eq('workspace_member_id', participantMemberId);
    if (error) throw new Error('Failed to remove participant.');

    await recordActivity(supabase, {
      workspaceId,
      entityType: 'meeting',
      entityId: meetingId,
      userId: actor.userId,
      memberId: actor.memberId,
      action: 'participant_removed',
      metadata: { participant_member_id: participantMemberId },
    });
    revalidateMeetings(actor.workspaceSlug, meetingId);
    return { success: true };
  } catch (error: unknown) {
    console.error('Remove participant error:', error);
    return { error: getErrorMessage(error, 'Failed to remove participant.') };
  }
}
