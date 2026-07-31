'use client';

import { useState, useTransition } from 'react';
import { Lead, type LeadStatus } from '@/types/lead';
import { changeLeadStatus } from '@/actions/lead';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

const COLUMNS: { id: LeadStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'analyzed', label: 'Analyzed' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'responded', label: 'Responded' },
  { id: 'meeting_scheduled', label: 'Meeting' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

export function LeadsKanban({ 
  initialLeads, 
  workspaceId 
}: { 
  initialLeads: Lead[], 
  workspaceId: string 
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [, startTransition] = useTransition();

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, statusId: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;

    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.status === statusId) return;

    // Optimistic UI update
    setLeads(current => current.map(l => 
      l.id === leadId ? { ...l, status: statusId } : l
    ));

    // Server update
    startTransition(async () => {
      await changeLeadStatus(workspaceId, leadId, statusId);
    });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-2 snap-x">
      {COLUMNS.map((column) => (
        <div 
          key={column.id} 
          className="flex-shrink-0 w-80 flex flex-col bg-muted/30 rounded-lg p-3 snap-start"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="font-semibold text-sm">{column.label}</h3>
            <Badge variant="secondary" className="text-xs">
              {leads.filter(l => l.status === column.id).length}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-[200px]">
            {leads
              .filter(l => l.status === column.id)
              .map(lead => (
                <Card 
                  key={lead.id} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                  className="cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="font-medium text-sm truncate">
                      {lead.company_name}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{lead.source || 'Unknown'}</span>
                      <span>
                        {formatDistanceToNow(new Date(lead.created_at))} ago
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
