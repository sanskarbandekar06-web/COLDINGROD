'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReportActions({ backHref }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" render={<Link href={backHref} />}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to lead
      </Button>
      <Button type="button" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden="true" />
        Print or save PDF
      </Button>
    </div>
  );
}
