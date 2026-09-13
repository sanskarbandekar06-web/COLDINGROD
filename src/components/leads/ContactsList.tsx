'use client';

import { useRouter } from 'next/navigation';
import { supportsContactChannel, whatsappDestination } from '@/lib/contact-channels';
import { useState, useTransition } from 'react';
import { Briefcase, Link2, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createContact, deleteContact, updateContactWhatsapp } from '@/actions/contact';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { LeadContact } from '@/types/lead';

function availablePlatforms(contact: LeadContact) {
  const platforms: string[] = [];
  if (contact.email) platforms.push('Email');
  if (contact.phone) platforms.push(contact.phone_type === 'landline' ? 'Telephone' : 'Phone');
  if (supportsContactChannel(contact, 'whatsapp')) platforms.push('WhatsApp');
  if (supportsContactChannel(contact, 'sms')) platforms.push('SMS');
  if (contact.linkedin_url) platforms.push('LinkedIn');
  if (contact.instagram_handle) platforms.push('Instagram');
  if (contact.facebook_url) platforms.push('Facebook');
  return platforms;
}

export function ContactsList({
  contacts,
  leadId,
  workspaceId,
}: {
  contacts: LeadContact[];
  leadId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingWhatsapp, setEditingWhatsapp] = useState<LeadContact | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createContact(workspaceId, leadId, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success('Contact added');
      setIsCreateOpen(false);
    });
  };

  const handleDelete = (contactId: string) => {
    if (!confirm('Are you sure you want to remove this contact?')) return;
    startTransition(async () => {
      const result = await deleteContact(workspaceId, leadId, contactId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Contact removed');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={isPending} onClick={() => startTransition(async () => {
          try {
            const response = await fetch('/api/outreach/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, workspaceId }) });
            if (!response.ok) throw new Error('Contact research could not be completed. Please try again.');
            toast.success('Public contact research refreshed. Owner contacts appear when the source identifies them.');
            router.refresh();
          } catch (error) { toast.error(error instanceof Error ? error.message : 'Contact research failed'); }
        })}>{isPending ? 'Researching…' : 'Find verified contacts'}</Button>
        <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-lg border bg-muted/20 py-6 text-center text-sm text-muted-foreground">
          No contacts added yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="group flex flex-col justify-between gap-4 rounded-lg border p-4 sm:flex-row"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">
                    {contact.first_name} {contact.last_name || ''}
                  </h4>
                  {contact.contact_kind === 'owner' && <Badge variant="outline">Owner · public source</Badge>}
                  {contact.is_primary && (
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      Primary
                    </Badge>
                  )}
                </div>
                {contact.job_title && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3" /> {contact.job_title}
                  </div>
                )}
                <div className="flex flex-col gap-1 pt-2">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="h-3 w-3" /> {contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" /> {contact.phone}
                    </a>
                  )}
                </div>
                {whatsappDestination(contact) && <a className="block text-xs text-primary underline" href={`https://wa.me/${whatsappDestination(contact)!.slice(1)}`} target="_blank" rel="noreferrer">WhatsApp {contact.whatsapp_number} · {contact.whatsapp_status}</a>}
                {contact.phone && !whatsappDestination(contact) && <p className="text-xs text-muted-foreground">WhatsApp has not been verified for this number.</p>}
                <Button variant="link" size="sm" className="h-auto px-0" onClick={() => { setError(null); setEditingWhatsapp(contact); }}>Correct WhatsApp details</Button>
                {contact.source_url && <a className="block truncate text-xs text-primary underline" href={contact.source_url} target="_blank" rel="noreferrer">View contact source</a>}
                <div className="pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Available platforms
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {availablePlatforms(contact).length > 0 ? (
                      availablePlatforms(contact).map((platform) => (
                        <Badge key={platform} variant="outline" className="font-normal">
                          {platform}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No verified destination found yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                {contact.linkedin_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-600 hover:text-blue-700"
                    onClick={() => window.open(contact.linkedin_url!, '_blank', 'noopener,noreferrer')}
                    aria-label={`Open ${contact.first_name}'s LinkedIn`}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                )}
                {contact.instagram_handle && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-pink-600 hover:text-pink-700"
                    onClick={() =>
                      window.open(
                        `https://instagram.com/${contact.instagram_handle}`,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                    aria-label={`Open ${contact.first_name}'s Instagram`}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                )}
                {contact.facebook_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-600 hover:text-blue-700"
                    onClick={() => window.open(contact.facebook_url!, '_blank', 'noopener,noreferrer')}
                    aria-label={`Open ${contact.first_name}'s Facebook`}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  onClick={() => handleDelete(contact.id)}
                  disabled={isPending}
                  aria-label={`Remove ${contact.first_name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editingWhatsapp)} onOpenChange={(open) => { if (!open) setEditingWhatsapp(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Correct WhatsApp details</DialogTitle>
            <DialogDescription>A telephone listing is not proof of a WhatsApp account. Only confirm a number you have checked; otherwise mark it unavailable.</DialogDescription>
          </DialogHeader>
          <form key={editingWhatsapp?.id} className="space-y-4" action={(formData) => startTransition(async () => {
            if (!editingWhatsapp) return;
            setError(null);
            const result = await updateContactWhatsapp(workspaceId, leadId, editingWhatsapp.id, formData);
            if (result.error) { setError(result.error); return; }
            toast.success('WhatsApp details updated'); setEditingWhatsapp(null); router.refresh();
          })}>
            <div className="space-y-2"><Label htmlFor="wa-number">WhatsApp number including country code</Label><Input id="wa-number" name="whatsappNumber" type="tel" placeholder="+91…" defaultValue={editingWhatsapp?.whatsapp_number || ''} /></div>
            <div className="space-y-2"><Label htmlFor="wa-status">Status</Label><select className="w-full rounded-md border bg-background p-2 text-sm" id="wa-status" name="status" defaultValue="confirmed"><option value="confirmed">I checked this WhatsApp account</option><option value="unavailable">Unavailable — do not offer WhatsApp</option></select></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="verified" className="mt-1" />I verified this number belongs to this contact on WhatsApp.</label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save WhatsApp details'}</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>
              Add a decision maker or point of contact for this lead.
            </DialogDescription>
          </DialogHeader>
          <form action={handleCreate} className="space-y-4">
            {error && (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-first-name">First name</Label>
                <Input id="contact-first-name" name="firstName" required maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-last-name">Last name</Label>
                <Input id="contact-last-name" name="lastName" maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-facebook">Facebook page URL</Label>
              <Input id="contact-facebook" name="facebookUrl" type="url" maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-job-title">Job title</Label>
              <Input id="contact-job-title" name="jobTitle" maxLength={160} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" name="email" type="email" maxLength={320} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" name="phone" type="tel" maxLength={50} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-linkedin">LinkedIn URL</Label>
                <Input id="contact-linkedin" name="linkedinUrl" type="url" maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-instagram">Instagram handle</Label>
                <Input id="contact-instagram" name="instagramHandle" maxLength={100} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isPrimary" value="true" />
              Set as primary contact
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Adding…' : 'Add contact'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
