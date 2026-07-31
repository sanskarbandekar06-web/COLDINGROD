import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type {
  FollowUpSequence,
  FollowUpStep,
} from '@/types/follow-up';

function parseCadence(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (day): day is number =>
          typeof day === 'number' && Number.isInteger(day),
      )
    : [];
}

export const getFollowUpSequenceForMessage = cache(
  async (
    workspaceId: string,
    messageId: string,
  ): Promise<FollowUpSequence | null> => {
    const supabase = await createClient();

    let { data: sequence, error } = await supabase
      .from('follow_up_sequences')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('original_message_id', messageId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching follow-up sequence:', error.message);
      throw new Error('Failed to fetch follow-up sequence');
    }

    if (!sequence) {
      const { data: step, error: stepError } = await supabase
        .from('follow_up_steps')
        .select('sequence_id')
        .eq('workspace_id', workspaceId)
        .eq('message_id', messageId)
        .maybeSingle();

      if (stepError) {
        console.error('Error resolving follow-up step:', stepError.message);
        throw new Error('Failed to resolve follow-up step');
      }

      if (step) {
        const result = await supabase
          .from('follow_up_sequences')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('id', step.sequence_id)
          .maybeSingle();
        sequence = result.data;
        error = result.error;
        if (error) {
          console.error('Error fetching follow-up sequence:', error.message);
          throw new Error('Failed to fetch follow-up sequence');
        }
      }
    }

    if (!sequence) return null;

    const { data: steps, error: stepsError } = await supabase
      .from('follow_up_steps')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('sequence_id', sequence.id)
      .order('step_number');

    if (stepsError) {
      console.error('Error fetching follow-up steps:', stepsError.message);
      throw new Error('Failed to fetch follow-up steps');
    }

    return {
      ...(sequence as Omit<FollowUpSequence, 'cadence_days' | 'steps'>),
      cadence_days: parseCadence(sequence.cadence_days),
      steps: (steps ?? []) as FollowUpStep[],
    };
  },
);
