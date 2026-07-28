import { Badge } from '@/components/ui/badge';
import { OutreachPlatform } from '@/types/outreach';
import React from 'react';
import {
  Mail,
  MessageSquare,
  Phone,
  Link as LinkIcon,
  AtSign,
} from 'lucide-react';

interface ChannelBadgeProps {
  platform: OutreachPlatform;
  className?: string;
}

const channelConfig: Record<
  OutreachPlatform,
  { label: string; Icon: React.ElementType }
> = {
  email: { label: 'Email', Icon: Mail },
  linkedin: { label: 'LinkedIn', Icon: LinkIcon },
  whatsapp: { label: 'WhatsApp', Icon: MessageSquare },
  instagram: { label: 'Instagram', Icon: AtSign },
  facebook: { label: 'Facebook', Icon: LinkIcon },
  sms: { label: 'SMS', Icon: Phone },
};

export function ChannelBadge({ platform, className }: ChannelBadgeProps) {
  const config = channelConfig[platform] ?? { label: platform, Icon: MessageSquare };
  const { label, Icon } = config;
  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1 ${className ?? ''}`}
      aria-label={`Channel: ${label}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}
