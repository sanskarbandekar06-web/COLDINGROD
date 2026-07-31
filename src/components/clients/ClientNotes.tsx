'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addClientNoteAction, deleteClientNoteAction } from '@/actions/clients';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import type { Activity } from '@/types/lead';

export function ClientNotes({ notes, workspaceId, clientId }: { notes: Activity[], workspaceId: string, clientId: string }) {
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setIsSubmitting(true);
    const result = await addClientNoteAction(workspaceId, clientId, newNote);
    setIsSubmitting(false);

    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success('Note added');
      setNewNote('');
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;
    const result = await deleteClientNoteAction(workspaceId, clientId, noteId);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success('Note deleted');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea 
            placeholder="Write a note..." 
            value={newNote} 
            onChange={(e) => setNewNote(e.target.value)} 
            rows={3}
          />
          <div className="flex justify-end">
            <Button onClick={handleAddNote} disabled={isSubmitting || !newNote.trim()}>
              {isSubmitting ? 'Saving...' : 'Add Note'}
            </Button>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center">No notes yet.</p>
          ) : (
            notes.map(note => {
              const actor = Array.isArray(note.actor_user) ? note.actor_user[0] : note.actor_user;
              const actorName = actor?.full_name ?? 'Unknown';
              return (
                <div key={note.id} className="bg-muted/30 p-4 rounded-lg relative group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {actorName} • {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.metadata?.content || ''}</p>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
