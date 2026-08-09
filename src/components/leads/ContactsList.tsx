'use client';

import { useState, useTransition } from 'react';
import { Briefcase, Link2, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createContact, deleteContact } from '@/actions/contact';
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

export function ContactsList({
  contacts,
  leadId,
  workspaceId,
}: {
  contacts: LeadContact[];
  leadId: string;
  workspaceId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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
      <div className="flex justify-end">
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
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">
                    {contact.first_name} {contact.last_name || ''}
                  </h4>
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
