'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { addClientNoteAction, deleteClientNoteAction, updateClientNoteAction } from '@/actions/clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { Activity } from '@/types/lead';

export function ClientNotes({ notes, workspaceId, clientId, canManage }: {
  notes: Activity[];
  workspaceId: string;
  clientId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setBusyId('new');
    const result = await addClientNoteAction(workspaceId, clientId, newNote);
    setBusyId(null);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Note added');
      setNewNote('');
      router.refresh();
    }
  };

  const beginEdit = (note: Activity) => {
    setEditingId(note.id);
    setEditingContent(typeof note.metadata?.content === 'string' ? note.metadata.content : '');
  };

  const handleUpdate = async () => {
    if (!editingId || !editingContent.trim()) return;
    setBusyId(editingId);
    const result = await updateClientNoteAction(workspaceId, clientId, editingId, editingContent);
    setBusyId(null);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Note updated');
      setEditingId(null);
      setEditingContent('');
      router.refresh();
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm('Redact this note? Its audit record will be preserved.')) return;
    setBusyId(noteId);
    const result = await deleteClientNoteAction(workspaceId, clientId, noteId);
    setBusyId(null);
    if (result.error) toast.error(result.error);
    else {
      toast.success('Note redacted');
      router.refresh();
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canManage && <div className="space-y-2"><Textarea placeholder="Write a note…" value={newNote} onChange={(event) => setNewNote(event.target.value)} maxLength={5000} rows={3} /><div className="flex justify-end"><Button onClick={handleAddNote} disabled={busyId === 'new' || !newNote.trim()}>{busyId === 'new' ? 'Saving…' : 'Add note'}</Button></div></div>}
        <div className="space-y-4 border-t pt-4">
          {notes.length === 0 ? <p className="text-center text-sm text-muted-foreground">No notes yet.</p> : notes.map((note) => {
            const actor = Array.isArray(note.actor_user) ? note.actor_user[0] : note.actor_user;
            const deleted = Boolean(note.metadata?.deleted);
            const edited = Boolean(note.metadata?.edited);
            const content = typeof note.metadata?.content === 'string' ? note.metadata.content : '';
            const editing = editingId === note.id;
            return (
              <div key={note.id} className="group relative rounded-lg bg-muted/30 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">{actor?.full_name ?? 'Unknown'} • {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}{edited && !deleted ? ' • edited' : ''}</span>
                  {canManage && !deleted && <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editing ? setEditingId(null) : beginEdit(note)} aria-label={editing ? 'Cancel editing note' : 'Edit note'}>{editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={busyId === note.id} onClick={() => handleDelete(note.id)} aria-label="Redact note"><Trash2 className="h-4 w-4" /></Button>
                  </div>}
                </div>
                {deleted ? <p className="text-sm italic text-muted-foreground">This note was redacted. The audit record has been preserved.</p> : editing ? <div className="space-y-2"><Textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} maxLength={5000} rows={3} /><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button><Button size="sm" onClick={handleUpdate} disabled={busyId === note.id || !editingContent.trim()}>{busyId === note.id ? 'Saving…' : 'Save'}</Button></div></div> : <p className="whitespace-pre-wrap text-sm">{content}</p>}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
