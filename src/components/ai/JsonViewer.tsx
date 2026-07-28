'use client';

import { useState } from 'react';
import { safeJsonStringify } from '@/services/ai-sanitizer.service';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface JsonViewerProps {
  data: Record<string, unknown> | null | undefined;
  label: string;
  maxLength?: number;
}

export function JsonViewer({ data, label, maxLength = 1000 }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-xs text-muted-foreground italic">Empty</p>
      </div>
    );
  }

  const fullText = safeJsonStringify(data, 99999);
  const displayText = expanded ? fullText : safeJsonStringify(data, maxLength);
  const isTruncated = fullText.length > maxLength;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="relative">
        <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed max-h-64 overflow-y-auto">
          {displayText}
        </pre>
        {isTruncated && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
            aria-label={expanded ? 'Collapse JSON viewer' : 'Expand to see full JSON'}
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Collapse</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Expand ({fullText.length.toLocaleString()} chars)</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
