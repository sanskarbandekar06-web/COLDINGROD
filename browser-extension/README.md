# Coldingrod Browser Companion

A Chrome/Edge Manifest V3 side-panel extension for page-aware lead context and human-controlled outreach.

## Features

- Reads the active tab title and URL only after the user opens the companion.
- Matches an existing Coldingrod lead by website or supported social profile.
- Shows contacts and recent cross-workspace outreach history.
- Analyzes available public lead evidence and suggests channel-native Email,
  LinkedIn, WhatsApp, Instagram, or SMS copy directly in the side panel.
- Keeps every AI suggestion editable before it becomes a versioned draft.
- Offers **Suggest a different draft** and includes the unsaved suggestion in
  the no-repeat check before generating the next option.
- Creates versioned outreach drafts that always enter `pending_approval`.
- Builds each suggestion from the lead's Executive Summary and Detailed Analysis and avoids repeating recent drafts.
- Refreshes independently verified website/contact-page channels before presenting Email, WhatsApp, SMS, LinkedIn, or Instagram.
- Lets an authorized human approve or reject a message from the side panel.
- Adds a secure bridge to the Coldingrod message page for one-click approved delivery handoff.
- Prefills email, WhatsApp, and SMS; copies approved text before opening LinkedIn, Instagram, or Facebook.
- Opens the verified provider immediately after approval so the reviewed message can be sent without hunting for another control.
- Records a message as sent only after the user confirms the real send happened.
- Keeps the original Lead Discovery capture workflow for unmatched pages.

## Install

1. Download `coldingrod-browser-companion.zip` from Coldingrod Settings → Browser Companion.
2. Extract the ZIP to a folder you will keep.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted folder.
6. Pin **Coldingrod Browser Companion**.
7. In Coldingrod, open Settings → Browser Companion and generate a pairing key.
8. Click the extension icon, paste the key, and connect.

Chrome 114 or newer is required for the Side Panel API.

## Security model

- The extension stores a revocable, 90-day pairing key in `chrome.storage.local`.
- Local storage access is restricted to trusted extension contexts.
- Coldingrod stores only the SHA-256 hash of the pairing key.
- The key is scoped to one user, one workspace, active membership, and current permissions.
- Requests are rate limited and audited. Keys can be revoked from workspace settings.
- No password, Supabase session, Supabase key, Google Places key, or provider OAuth token is stored.
- Customer-facing content is never falsely marked sent. A human approves, performs the provider's final send, and confirms delivery from Coldingrod or the side panel.

## Development

Use `https://coldingrod.vercel.app` for production or `http://localhost:3000` for local development. Both origins are declared explicitly in `host_permissions`; the extension does not request access to arbitrary websites for backend requests.
