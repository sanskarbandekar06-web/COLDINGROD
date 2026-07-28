'use client';

/**
 * CreateMessageDialog — Manual outreach draft creation
 *
 * Security:
 * - workspace_id is passed from the server-side page, not a hidden form field
 * - workspaceId is validated server-side in the action
 * - lead and contact IDs from dropdowns are validated server-side
 * - no trusted identity fields accepted from the browser
 */

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { createOutreachDraftAction } from '@/actions/outreach';
import { OUTREACH_PLATFORMS, OutreachPlatform } from '@/types/outreach';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface LeadOption {
  id: string;
  company_name: string;
}

interface ContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
}

interface CreateMessageDialogProps {
  workspaceSlug: string;
  workspaceId: string;
  leads: LeadOption[];
}

const platformLabels: Record<OutreachPlatform, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  sms: 'SMS',
};

export function CreateMessageDialog({
  workspaceSlug,
  workspaceId,
  leads,
}: CreateMessageDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [platform, setPlatform] = useState<OutreachPlatform | ''>('');

  async function handleLeadChange(leadId: string | null) {
    const nextLeadId = leadId ?? '';
    setSelectedLeadId(nextLeadId);
    setContacts([]);
    if (!nextLeadId) return;
    setLoadingContacts(true);
    try {
      const res = await fetch(`/api/outreach/contacts?leadId=${encodeURIComponent(nextLeadId)}&workspaceId=${encodeURIComponent(workspaceId)}`);
      if (res.ok) {
        const data = await res.json() as ContactOption[];
        setContacts(data);
      }
    } catch {
      // Silently fail — contacts list will be empty
    } finally {
      setLoadingContacts(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await createOutreachDraftAction(workspaceSlug, workspaceId, formData);
      if (result.success) {
        toast.success('Message draft created.');
        setOpen(false);
        form.reset();
        setSelectedLeadId('');
        setContacts([]);
        setPlatform('');
        if (result.messageId) {
          router.push(`/dashboard/${workspaceSlug}/outreach/messages/${result.messageId}`);
        }
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="flex items-center gap-2" />}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        New Message
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg" aria-describedby="create-msg-desc">
        <DialogHeader>
          <DialogTitle>New Outreach Message</DialogTitle>
          <p id="create-msg-desc" className="text-sm text-muted-foreground">
            Create a manual outreach draft. External delivery is not performed — this prepares content only.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lead */}
          <div className="space-y-1.5">
            <Label htmlFor="lead_id">Lead *</Label>
            <Select
              name="lead_id"
              value={selectedLeadId}
              onValueChange={handleLeadChange}
              required
            >
              <SelectTrigger id="lead_id" aria-label="Select lead">
                <SelectValue placeholder="Select a lead…" />
              </SelectTrigger>
              <SelectContent>
                {leads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {lead.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact */}
          <div className="space-y-1.5">
            <Label htmlFor="contact_id">Contact (optional)</Label>
            <Select name="contact_id" disabled={!selectedLeadId || loadingContacts}>
              <SelectTrigger id="contact_id" aria-label="Select contact">
                <SelectValue
                  placeholder={
                    loadingContacts
                      ? 'Loading contacts…'
                      : selectedLeadId
                      ? 'Select a contact…'
                      : 'Select a lead first'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name ?? ''}{c.email ? ` · ${c.email}` : ''}
                  </SelectItem>
                ))}
                {contacts.length === 0 && !loadingContacts && (
                  <SelectItem value="__none__" disabled>
                    No contacts for this lead
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Channel */}
          <div className="space-y-1.5">
            <Label htmlFor="platform">Channel *</Label>
            <Select
              name="platform"
              value={platform}
              onValueChange={(value) => setPlatform((value as OutreachPlatform | null) ?? '')}
              required
            >
              <SelectTrigger id="platform" aria-label="Select channel">
                <SelectValue placeholder="Select channel…" />
              </SelectTrigger>
              <SelectContent>
                {OUTREACH_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {platformLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject (shown for email) */}
          {platform === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" placeholder="Email subject…" maxLength={300} />
            </div>
          )}

          {/* Content */}
          <div className="space-y-1.5">
            <Label htmlFor="content">Message *</Label>
            <Textarea
              id="content"
              name="content"
              placeholder="Write your outreach message…"
              className="min-h-[120px]"
              required
              maxLength={10000}
              aria-describedby="content-guidance"
            />
            <p id="content-guidance" className="text-xs text-muted-foreground">
              {platform
                ? `This is a ${platformLabels[platform as OutreachPlatform] ?? platform} draft. Character limits are advisory guidance only.`
                : 'Select a channel to see guidance.'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create Draft'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
