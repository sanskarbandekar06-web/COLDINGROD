'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Loader2, PencilLine, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createOutreachDraftAction } from '@/actions/outreach';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { OUTREACH_PLATFORMS, type OutreachPlatform } from '@/types/outreach';

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
  canGenerate: boolean;
}

const labels: Record<OutreachPlatform, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  sms: 'SMS',
};

const AI_CHANNELS = ['email', 'linkedin', 'whatsapp', 'instagram', 'sms'] as const;
const TONES = [
  { value: 'consultative', label: 'Consultative' },
  { value: 'concise', label: 'Concise' },
  { value: 'warm', label: 'Warm' },
] as const;
const GOALS = [
  { value: 'offer_audit', label: 'Offer a short audit' },
  { value: 'share_idea', label: 'Share one useful idea' },
  { value: 'book_call', label: 'Book a 15-minute call' },
] as const;

function supportsChannel(contact: ContactOption, platform: string) {
  if (platform === 'email') return Boolean(contact.email);
  if (platform === 'linkedin') return Boolean(contact.linkedin_url);
  if (platform === 'instagram') return Boolean(contact.instagram_handle);
  if (platform === 'whatsapp' || platform === 'sms') return Boolean(contact.phone);
  return true;
}

export function CreateMessageDialog({
  workspaceSlug,
  workspaceId,
  leads,
  canGenerate,
}: CreateMessageDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'ai' | 'manual'>(canGenerate ? 'ai' : 'manual');
  const [leadId, setLeadId] = useState('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactId, setContactId] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [platform, setPlatform] = useState<OutreachPlatform>('email');
  const [tone, setTone] = useState('consultative');
  const [goal, setGoal] = useState('offer_audit');

  const reachableContacts = mode === 'ai'
    ? contacts.filter((contact) => supportsChannel(contact, platform))
    : contacts;

  function reset() {
    setLeadId('');
    setContacts([]);
    setContactId('');
    setPlatform('email');
    setTone('consultative');
    setGoal('offer_audit');
  }

  async function changeLead(nextLeadId: string | null) {
    const selected = nextLeadId ?? '';
    setLeadId(selected);
    setContacts([]);
    setContactId('');
    if (!selected) return;
    setLoadingContacts(true);
    try {
      const response = await fetch(
        `/api/outreach/contacts?leadId=${encodeURIComponent(selected)}&workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      if (response.ok) setContacts(await response.json() as ContactOption[]);
      else toast.error('Contacts could not be loaded.');
    } catch {
      toast.error('Contacts could not be loaded.');
    } finally {
      setLoadingContacts(false);
    }
  }

  function changePlatform(value: string | null) {
    setPlatform((value ?? 'email') as OutreachPlatform);
    setContactId('');
  }

  function changeMode(nextMode: 'ai' | 'manual') {
    setMode(nextMode);
    setContactId('');
    if (nextMode === 'ai' && platform === 'facebook') setPlatform('email');
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    startTransition(async () => {
      if (mode === 'ai') {
        if (!leadId || !contactId) {
          toast.error('Choose a lead and a reachable contact.');
          return;
        }
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
        toast.success(`${labels[platform]} draft prepared. Review and edit it now.`);
        setOpen(false);
        reset();
        router.push(
          `/dashboard/${workspaceSlug}/outreach/messages/${result.messageId}?edit=1`,
        );
        return;
      }

      const result = await createOutreachDraftAction(
        workspaceSlug,
        workspaceId,
        new FormData(form),
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Manual message draft created.');
      setOpen(false);
      reset();
      if (result.messageId) {
        router.push(`/dashboard/${workspaceSlug}/outreach/messages/${result.messageId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" aria-hidden="true" />
        New Message
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create outreach</DialogTitle>
          <DialogDescription>
            Start with platform-native suggested copy or write your own message.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="group" aria-label="Message creation method">
          <Button
            type="button"
            size="sm"
            variant={mode === 'ai' ? 'default' : 'ghost'}
            onClick={() => changeMode('ai')}
            disabled={!canGenerate || pending}
            aria-pressed={mode === 'ai'}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            AI suggested
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'manual' ? 'default' : 'ghost'}
            onClick={() => changeMode('manual')}
            disabled={pending}
            aria-pressed={mode === 'manual'}
          >
            <PencilLine className="size-4" aria-hidden="true" />
            Write manually
          </Button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="outreach-lead">Lead *</Label>
              <Select name="lead_id" value={leadId} onValueChange={changeLead} required>
                <SelectTrigger id="outreach-lead" className="w-full" aria-label="Select lead">
                  <SelectValue placeholder="Select a lead…" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>{lead.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="outreach-channel">Channel *</Label>
              <Select name="platform" value={platform} onValueChange={changePlatform} required>
                <SelectTrigger id="outreach-channel" className="w-full" aria-label="Select outreach channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(mode === 'ai' ? AI_CHANNELS : OUTREACH_PLATFORMS).map((channel) => (
                    <SelectItem key={channel} value={channel}>{labels[channel]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outreach-contact">Reachable contact {mode === 'ai' ? '*' : '(optional)'}</Label>
            <Select
              name="contact_id"
              value={contactId}
              onValueChange={(value) => setContactId(value ?? '')}
              disabled={!leadId || loadingContacts || reachableContacts.length === 0}
              required={mode === 'ai'}
            >
              <SelectTrigger id="outreach-contact" className="w-full" aria-label="Select contact">
                <SelectValue placeholder={loadingContacts ? 'Loading contacts…' : reachableContacts.length ? 'Select a contact…' : 'No reachable contact for this channel'} />
              </SelectTrigger>
              <SelectContent>
                {reachableContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name ?? ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === 'ai' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="outreach-tone">Tone</Label>
                  <Select value={tone} onValueChange={(value) => setTone(value ?? 'consultative')}>
                    <SelectTrigger id="outreach-tone" className="w-full" aria-label="Select message tone"><SelectValue /></SelectTrigger>
                    <SelectContent>{TONES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outreach-goal">Goal</Label>
                  <Select value={goal} onValueChange={(value) => setGoal(value ?? 'offer_audit')}>
                    <SelectTrigger id="outreach-goal" className="w-full" aria-label="Select outreach goal"><SelectValue /></SelectTrigger>
                    <SelectContent>{GOALS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <Bot className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p>
                  Coldingrod uses verified lead research and a channel-specific writing style. The generated copy opens immediately in an editable review dialog.
                </p>
              </div>
            </>
          ) : (
            <>
              {platform === 'email' && (
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" name="subject" maxLength={300} placeholder="Email subject…" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="content">Message *</Label>
                <Textarea id="content" name="content" className="min-h-32" maxLength={10000} required placeholder="Write your outreach message…" />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || !leadId || (mode === 'ai' && !contactId)}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : mode === 'ai' ? <ShieldCheck className="size-4" aria-hidden="true" /> : <PencilLine className="size-4" aria-hidden="true" />}
              {pending ? 'Preparing…' : mode === 'ai' ? `Suggest ${labels[platform]} draft` : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
