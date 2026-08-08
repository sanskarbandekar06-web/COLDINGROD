'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CopyCheck, ExternalLink, Loader2, PlugZap, Send } from 'lucide-react';
import { toast } from 'sonner';
import { confirmOutreachSentAction } from '@/actions/outreach';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const REQUEST_EVENT = 'coldingrod:companion-request';
const RESPONSE_EVENT = 'coldingrod:companion-response';

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function destinationFor(message, contact) {
  const body = encodeURIComponent(message.content || '');
  const subject = encodeURIComponent(message.subject || '');
  switch (message.platform) {
    case 'email':
      return contact?.email
        ? `mailto:${encodeURIComponent(contact.email)}?subject=${subject}&body=${body}`
        : null;
    case 'whatsapp': {
      const phone = cleanPhone(contact?.phone);
      return phone ? `https://wa.me/${phone}?text=${body}` : null;
    }
    case 'linkedin':
      return contact?.linkedin_url || null;
    case 'instagram': {
      const handle = String(contact?.instagram_handle || '').replace(/^@/, '').trim();
      return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : null;
    }
    case 'sms':
      return contact?.phone
        ? `sms:${encodeURIComponent(contact.phone)}?body=${body}`
        : null;
    default:
      return null;
  }
}

function bridgeRequest(action, payload = {}, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', receive);
      reject(new Error('COMPANION_UNAVAILABLE'));
    }, timeoutMs);

    function receive(event) {
      if (event.source !== window || event.data?.type !== RESPONSE_EVENT || event.data?.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      if (event.data.ok) resolve(event.data.data || {});
      else reject(new Error(event.data.error || 'COMPANION_REQUEST_FAILED'));
    }

    window.addEventListener('message', receive);
    window.postMessage({ type: REQUEST_EVENT, requestId, action, payload }, window.location.origin);
  });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function CompanionDeliveryPanel({
  workspaceSlug,
  workspaceId,
  message,
  contact,
  isReady,
  canManage,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [extension, setExtension] = useState({ detected: false, paired: false });
  const [prepared, setPrepared] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const destination = useMemo(() => destinationFor(message, contact), [message, contact]);
  const terminal = ['sent', 'delivered', 'replied'].includes(message.status);

  useEffect(() => {
    bridgeRequest('status', {}, 700)
      .then((data) => setExtension({ detected: true, paired: Boolean(data.paired) }))
      .catch(() => setExtension({ detected: false, paired: false }));
  }, []);

  async function prepare() {
    if (!destination) {
      toast.error('This contact has no usable destination for the selected channel.');
      return;
    }

    try {
      await copyText(message.content);
      let openedByCompanion = false;
      try {
        await bridgeRequest('open_delivery', {
          platform: message.platform,
          destination,
        });
        openedByCompanion = true;
      } catch {
        window.open(destination, '_blank', 'noopener,noreferrer');
      }
      setPrepared(true);
      toast.success(
        openedByCompanion
          ? 'Companion prepared the provider in a background tab and copied the approved text.'
          : 'Provider opened and approved text copied. Pair the Companion for background handoff.',
      );
    } catch {
      toast.error('The provider could not be opened. Allow pop-ups or reload the Companion extension.');
    }
  }

  function confirmSent() {
    startTransition(async () => {
      const result = await confirmOutreachSentAction(
        workspaceSlug,
        workspaceId,
        message.id,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setConfirmOpen(false);
      toast.success('Delivery confirmed. Lead history and follow-up timing are updated.');
      router.refresh();
    });
  }

  if (!canManage) return null;

  if (terminal) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">Delivery recorded</p>
          <p className="mt-1 text-sm opacity-80">This message is already marked {message.status}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <PlugZap className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Coldingrod Browser Companion</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${extension.detected && extension.paired ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}`}>
              {extension.detected ? (extension.paired ? 'Connected' : 'Pairing required') : 'Not detected'}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Email, WhatsApp, and SMS open with approved copy prefilled. LinkedIn and Instagram open the contact profile with the message copied for pasting.
          </p>
          {!extension.paired && (
            <Link href={`/dashboard/${workspaceSlug}/settings/browser-extension`} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
              Install or reconnect Companion
            </Link>
          )}
        </div>
      </div>

      {!isReady ? (
        <p className="text-sm text-muted-foreground">Complete the readiness checks and approve this message before delivery.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={prepare} disabled={!destination || pending}>
            {prepared ? <CopyCheck className="size-4" aria-hidden="true" /> : <ExternalLink className="size-4" aria-hidden="true" />}
            {prepared ? 'Prepared — open again' : `Send with ${message.platform}`}
          </Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={!prepared || pending}>
            <Send className="size-4" aria-hidden="true" />
            I sent it — confirm delivery
          </Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm the real send</DialogTitle>
            <DialogDescription>
              Confirm only after you completed the final send in {message.platform}. This updates the lead to contacted and starts follow-up timing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>Not yet</Button>
            <Button onClick={confirmSent} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
              {pending ? 'Confirming…' : 'Yes, it was sent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
