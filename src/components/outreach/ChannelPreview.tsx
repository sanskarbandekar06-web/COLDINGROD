'use client';

/**
 * ChannelPreview — safe text-only message preview
 *
 * Security requirements:
 * - renders plain text ONLY (no dangerouslySetInnerHTML, no eval)
 * - preserves line breaks via whitespace-pre-wrap CSS
 * - truncates large content with explicit expansion
 * - clearly labeled as "Preview" — not a real platform interface
 * - no external resources loaded
 * - no automatic link opening
 */

import { useState } from 'react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { OutreachPlatform } from '@/types/outreach';
import { Mail, MessageSquare, Phone, Link as LinkIcon, AtSign } from 'lucide-react';

const PREVIEW_CHAR_LIMIT = 500;

interface ChannelPreviewProps {
  platform: OutreachPlatform;
  content: string;
  subject?: string | null;
}

const platformLabels: Record<OutreachPlatform, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  sms: 'SMS',
};

const platformIcons: Record<OutreachPlatform, React.ElementType> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Phone,
  facebook: LinkIcon,
  instagram: AtSign,
  linkedin: LinkIcon,
};

export function ChannelPreview({ platform, content, subject }: ChannelPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const isTruncated = content.length > PREVIEW_CHAR_LIMIT;
  const displayedContent =
    isTruncated && !expanded ? content.slice(0, PREVIEW_CHAR_LIMIT) + '…' : content;

  const Icon = platformIcons[platform] ?? MessageSquare;
  const label = platformLabels[platform] ?? platform;

  return (
    <section
      aria-label={`${label} message preview`}
      className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-muted-foreground/20 bg-muted/50">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label} Preview
        </span>
        <span className="ml-auto text-xs text-muted-foreground italic">Coldingrod preview — not a real send</span>
      </div>

      {/* Subject (email only) */}
      {subject && platform === 'email' && (
        <div className="px-4 pt-3 pb-1 border-b border-muted-foreground/10">
          <p className="text-xs text-muted-foreground mb-1">Subject</p>
          {/* Plain text — no HTML rendering */}
          <p className="text-sm font-medium break-words">{subject}</p>
        </div>
      )}

      {/* Body */}
      <div className="px-4 py-3">
        <p
          className="text-sm whitespace-pre-wrap break-words leading-relaxed"
          aria-label="Message content preview"
        >
          {displayedContent}
        </p>

        {isTruncated && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs px-2"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? 'Show less' : `Show all (${content.length} characters)`}
          </Button>
        )}
      </div>
    </section>
  );
}
