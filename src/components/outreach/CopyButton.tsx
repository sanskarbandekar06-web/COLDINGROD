'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
}

export function CopyButton({
  text,
  label = 'Copy',
  size = 'sm',
  variant = 'outline',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy — please copy manually');
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      aria-label={copied ? 'Copied!' : label}
      className="flex items-center gap-1.5"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>{copied ? 'Copied!' : label}</span>
    </Button>
  );
}
