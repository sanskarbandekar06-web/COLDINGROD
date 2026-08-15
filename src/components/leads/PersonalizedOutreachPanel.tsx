'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Loader2, MessageSquareText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { generatePersonalizedOutreachAction } from '@/actions/personalized-outreach';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LeadContact } from '@/types/lead';

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'sms', label: 'SMS' },
] as const;

const TONES = [
  { value: 'consultative', label: 'Consultative' },
  { value: 'concise', label: 'Concise' },
  { value: 'warm', label: 'Warm' },
] as const;

const GOALS = [
  { value: 'offer_audit', label: 'Offer a short audit' },
  { value: 'share_idea', label: 'Share one idea' },
  { value: 'book_call', label: 'Book a 15-minute call' },
] as const;

function supportsChannel(contact: LeadContact, platform: string) {
  if (platform === 'email') return Boolean(contact.email);
  if (platform === 'linkedin') return Boolean(contact.linkedin_url);
  if (platform === 'instagram') return Boolean(contact.instagram_handle);
  if (platform === 'whatsapp' || platform === 'sms') return Boolean(contact.phone);
  return false;
}

function contactChannel(contact: LeadContact, platform: string) {
  if (platform === 'email') return contact.email;
  if (platform === 'linkedin') return contact.linkedin_url;
  if (platform === 'instagram') return contact.instagram_handle;
  return contact.phone;
}

export function PersonalizedOutreachPanel({
  workspaceSlug,
  leadId,
  contacts,
  canGenerate,
  hasResearch,
  hasOpportunity,
}: {
  workspaceSlug: string;
  leadId: string;
  contacts: LeadContact[];
  canGenerate: boolean;
  hasResearch: boolean;
  hasOpportunity: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [platform, setPlatform] = useState('email');
  const [contactId, setContactId] = useState('');
  const [tone, setTone] = useState('consultative');
  const [goal, setGoal] = useState('offer_audit');

  const reachableContacts = useMemo(
    () => contacts.filter((contact) => supportsChannel(contact, platform)),
    [contacts, platform],
  );

  function changePlatform(nextPlatform: string | null) {
    const selected = nextPlatform ?? 'email';
    setPlatform(selected);
    setContactId('');
  }

  function generateDraft() {
    if (!contactId) {
      toast.error('Select a reachable contact.');
      return;
    }

    startTransition(async () => {
      const result = await generatePersonalizedOutreachAction({
        workspaceSlug,
        leadId,
        contactId,
        platform,
        tone,
        goal,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Compliant draft created and sent to human review.');
      setOpen(false);
      router.push(
        `/dashboard/${workspaceSlug}/outreach/messages/${result.messageId}`,
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
        <ShieldCheck
          className="mt-0.5 size-5 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium">Human review stays mandatory</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasResearch && hasOpportunity
              ? 'Stored analysis is ready. The agents verify the channel, include opt-out language, and create a draft only.'
              : 'No manual qualification is required. The agents will collect public evidence, qualify and research the lead, then create a draft only.'}
            {' '}Nothing is sent without your review.
          </p>
        </div>
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          Add a contact with an email, phone number, LinkedIn URL, or Instagram
          handle first.
        </p>
      ) : canGenerate ? (
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!pending) setOpen(nextOpen);
          }}
        >
          <DialogTrigger
            render={<Button className="w-full" />}
          >
            <Bot className="size-4" aria-hidden="true" />
            Generate personalized draft
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Personalized Outreach Agent</DialogTitle>
              <DialogDescription>
                Choose the recipient and intent. If analysis is missing, the
                agents complete it automatically before writing the editable
                message and sending it to the Approval Center.
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                generateDraft();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="personalized-channel">Channel</Label>
                <Select value={platform} onValueChange={changePlatform}>
                  <SelectTrigger
                    id="personalized-channel"
                    className="w-full"
                    aria-label="Select outreach channel"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((channel) => (
                      <SelectItem key={channel.value} value={channel.value}>
                        {channel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="personalized-contact">Reachable contact</Label>
                <Select
                  value={contactId}
                  onValueChange={(value) => setContactId(value ?? '')}
                  disabled={reachableContacts.length === 0}
                >
                  <SelectTrigger
                    id="personalized-contact"
                    className="w-full"
                    aria-label="Select reachable contact"
                  >
                    <SelectValue
                      placeholder={
                        reachableContacts.length > 0
                          ? 'Select a contact…'
                          : 'No contact supports this channel'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {reachableContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.first_name} {contact.last_name ?? ''} ·{' '}
                        {contactChannel(contact, platform)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="personalized-tone">Tone</Label>
                  <Select
                    value={tone}
                    onValueChange={(value) =>
                      setTone(value ?? 'consultative')
                    }
                  >
                    <SelectTrigger
                      id="personalized-tone"
                      className="w-full"
                      aria-label="Select message tone"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="personalized-goal">Goal</Label>
                  <Select
                    value={goal}
                    onValueChange={(value) =>
                      setGoal(value ?? 'offer_audit')
                    }
                  >
                    <SelectTrigger
                      id="personalized-goal"
                      className="w-full"
                      aria-label="Select outreach goal"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOALS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <MessageSquareText
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  You will review the exact generated content before it becomes
                  eligible for any later delivery step.
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pending || !contactId}
                >
                  {pending ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Preparing…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-4" aria-hidden="true" />
                      Create review draft
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          AI and lead management permissions are required to generate outreach.
        </p>
      )}
    </div>
  );
}
