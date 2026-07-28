'use client';

import { LeadContact } from '@/types/lead';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Building, Briefcase, Plus, Link2, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { deleteContact } from '@/actions/contact';

export function ContactsList({ contacts, leadId, workspaceId }: { contacts: LeadContact[], leadId: string, workspaceId: string }) {
  const [isPending, startTransition] = useTransition();
  
  const handleDelete = (contactId: string) => {
    if (!confirm('Are you sure you want to remove this contact?')) return;
    startTransition(async () => {
      await deleteContact(workspaceId, leadId, contactId);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" /> Add Contact
        </Button>
      </div>
      
      {contacts.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg bg-muted/20">
          No contacts added yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {contacts.map((contact) => (
            <div key={contact.id} className="p-4 border rounded-lg flex flex-col sm:flex-row justify-between gap-4 group">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm">
                    {contact.first_name} {contact.last_name || ''}
                  </h4>
                  {contact.is_primary && (
                    <Badge variant="secondary" className="text-[10px] h-5">Primary</Badge>
                  )}
                </div>
                {contact.job_title && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3" /> {contact.job_title}
                  </div>
                )}
                <div className="flex flex-col gap-1 pt-2">
                  {contact.email && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> {contact.email}
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {contact.phone}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                {contact.linkedin_url && (
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" onClick={() => window.open(contact.linkedin_url!, '_blank')}>
                     <Link2 className="h-4 w-4" />
                   </Button>
                )}
                {contact.instagram_handle && (
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-pink-600 hover:text-pink-700" onClick={() => window.open(`https://instagram.com/${contact.instagram_handle}`, '_blank')}>
                     <Link2 className="h-4 w-4" />
                   </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(contact.id)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
