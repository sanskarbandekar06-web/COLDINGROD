export type OutreachPlatform =
  | 'instagram'
  | 'email'
  | 'linkedin'
  | 'whatsapp'
  | 'facebook'
  | 'sms';

export const OUTREACH_PLATFORMS: OutreachPlatform[] = [
  'email',
  'linkedin',
  'whatsapp',
  'instagram',
  'facebook',
  'sms',
];

export type OutreachStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'replied';

export const OUTREACH_STATUSES: OutreachStatus[] = [
  'draft',
  'pending_approval',
  'scheduled',
  'sent',
  'delivered',
  'failed',
  'replied',
];

export const EDITABLE_STATUSES: OutreachStatus[] = ['draft'];

export type OutreachDirection = 'inbound' | 'outbound';
