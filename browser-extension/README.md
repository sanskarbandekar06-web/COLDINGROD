# Coldingrod Lead Capture browser companion

This Chrome/Edge Manifest V3 extension sends the current website title and URL into Coldingrod's existing Lead Discovery review form. It never stores a password, Supabase access token, or private workspace data.

## Install for development

1. Download or clone the COLDINGROD repository.
2. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this `browser-extension` folder.
6. Pin **Coldingrod Lead Capture** from the browser extensions menu.
7. Open the extension, enter `https://coldingrod.vercel.app` and the workspace slug from the dashboard URL.

## Use

1. Open a business website or directory listing.
2. Click the Coldingrod extension.
3. Click **Capture for review**.
4. Coldingrod opens Lead Discovery with the page title and source URL prefilled.
5. Review and complete the business details before importing. The extension never auto-creates a lead.

## Security model

- No host permissions and no background service worker.
- `activeTab` reads only the tab where the user clicks the extension.
- `storage` saves only the app URL and workspace slug.
- Authentication remains in the normal Coldingrod website session.
- Human review remains mandatory before lead creation.