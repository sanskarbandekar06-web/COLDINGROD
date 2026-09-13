// WhatsApp is a distinct, evidenced destination. A telephone is never enough.
export function whatsappDestination(contact) {
  if (!contact || !['published', 'confirmed'].includes(contact.whatsapp_status)) return null;
  const number = String(contact.whatsapp_number ?? '').trim();
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}

export function supportsContactChannel(contact, platform) {
  if (!contact) return false;
  if (platform === 'whatsapp') return Boolean(whatsappDestination(contact));
  if (platform === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email ?? '');
  if (platform === 'sms') return contact.phone_type === 'mobile' && /^\+[1-9]\d{7,14}$/.test(contact.phone ?? '');
  if (platform === 'instagram') return /^[a-zA-Z0-9._]{1,30}$/.test(contact.instagram_handle ?? '');
  const field = platform === 'linkedin' ? 'linkedin_url' : platform === 'facebook' ? 'facebook_url' : null;
  if (!field || !contact[field]) return false;
  try {
    const url = new URL(contact[field]);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === `${platform}.com` || url.hostname.endsWith(`.${platform}.com`));
  } catch { return false; }
}

export function contactDestination(message, contact) {
  if (!supportsContactChannel(contact, message.platform)) return null;
  const body = encodeURIComponent(message.content || '');
  if (message.platform === 'whatsapp') return `https://wa.me/${whatsappDestination(contact).slice(1)}?text=${body}`;
  if (message.platform === 'email') return `mailto:${contact.email}?subject=${encodeURIComponent(message.subject || '')}&body=${body}`;
  if (message.platform === 'sms') return `sms:${contact.phone}?body=${body}`;
  if (message.platform === 'instagram') return `https://www.instagram.com/${contact.instagram_handle}/`;
  return contact[`${message.platform}_url`];
}
