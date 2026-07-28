'use server';

import { getLeadDetails } from '@/services/lead.service';
import { getLeadContacts } from '@/services/contact.service';

export async function getLeadDrawerData(workspaceId: string, leadId: string) {
  const [lead, contacts] = await Promise.all([
    getLeadDetails(workspaceId, leadId),
    getLeadContacts(leadId)
  ]);
  
  return { lead, contacts };
}
