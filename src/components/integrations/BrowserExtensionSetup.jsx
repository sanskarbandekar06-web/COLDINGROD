'use client';

import { useState, useTransition } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  MonitorSmartphone,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import {
  createBrowserExtensionConnectionAction,
  revokeBrowserExtensionConnectionAction,
} from '@/actions/browser-extension';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function BrowserExtensionSetup({
  workspaceSlug,
  connections,
  canManage,
}) {
  const [deviceName, setDeviceName] = useState('My browser');
  const [pairingKey, setPairingKey] = useState('');
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function createConnection() {
    setMessage(null);
    setCopied(false);
    startTransition(async () => {
      const result = await createBrowserExtensionConnectionAction(
        workspaceSlug,
        deviceName,
      );
      if (!result.success) {
        setMessage({ type: 'error', text: result.error });
        return;
      }
      setPairingKey(result.pairingKey);
      setMessage({
        type: 'success',
        text: 'Pairing key created. Copy it now; it is shown only once.',
      });
    });
  }

  function revokeConnection(connectionId) {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeBrowserExtensionConnectionAction(
        workspaceSlug,
        connectionId,
      );
      setMessage(
        result.success
          ? { type: 'success', text: 'Browser connection revoked.' }
          : { type: 'error', text: result.error },
      );
    });
  }

  async function copyPairingKey() {
    await navigator.clipboard.writeText(pairingKey);
    setCopied(true);
  }

  const activeConnections = connections.filter(
    (connection) => connection.is_active,
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-indigo/20 bg-brand-indigo-soft/50 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white p-2 text-brand-indigo shadow-sm">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-brand-navy">
              Secure browser pairing
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The extension receives a revocable workspace key—not your
              password, Supabase session, or database credentials. Every draft
              still requires a recorded human approval before delivery.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'error' ? (
            <KeyRound className="size-4" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          <AlertTitle>
            {message.type === 'error' ? 'Could not continue' : 'Ready'}
          </AlertTitle>
          <AlertDescription aria-live="polite">
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      {canManage ? (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <MonitorSmartphone
              className="size-5 text-brand-indigo"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold">Create a pairing key</h2>
              <p className="text-sm text-muted-foreground">
                Keys expire after 90 days and can be revoked at any time.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="browser-device-name">Device name</Label>
              <Input
                id="browser-device-name"
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                minLength={2}
                maxLength={80}
                autoComplete="off"
                placeholder="Office Chrome"
              />
            </div>
            <Button
              type="button"
              onClick={createConnection}
              disabled={pending || deviceName.trim().length < 2}
            >
              {pending ? (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <KeyRound className="size-4" aria-hidden="true" />
              )}
              Generate key
            </Button>
          </div>

          {pairingKey && (
            <div className="mt-4 space-y-2 rounded-lg border border-dashed p-4">
              <Label htmlFor="browser-pairing-key">
                One-time pairing key
              </Label>
              <div className="flex gap-2">
                <Input
                  id="browser-pairing-key"
                  value={pairingKey}
                  readOnly
                  className="font-mono text-xs"
                  aria-describedby="pairing-key-help"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyPairingKey}
                  aria-label="Copy pairing key"
                >
                  {copied ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p
                id="pairing-key-help"
                className="text-xs text-muted-foreground"
              >
                Paste this into the extension once. Coldingrod stores only its
                cryptographic hash.
              </p>
            </div>
          )}
        </div>
      ) : (
        <Alert>
          <KeyRound className="size-4" aria-hidden="true" />
          <AlertTitle>Administrator pairing required</AlertTitle>
          <AlertDescription>
            Ask a workspace member with integration-management permission to
            create your browser pairing key.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Your connected browsers</h2>
            <p className="text-sm text-muted-foreground">
              Only connections created by your account appear here.
            </p>
          </div>
          <Badge variant="outline">
            {activeConnections.length} active
          </Badge>
        </div>

        {activeConnections.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No active browser connection yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y" aria-label="Active browser connections">
            {activeConnections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{connection.device_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last used: {formatDate(connection.last_used_at)}
                    {' · '}
                    Expires: {formatDate(connection.expires_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => revokeConnection(connection.id)}
                >
                  <Unplug className="size-4" aria-hidden="true" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
