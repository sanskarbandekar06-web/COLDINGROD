# Google Places setup for beginners

The application works without a Google key. Adding the key enables live Google Places Text Search (New) on the lead discovery page.

## Create and restrict the key

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Attach a billing account; Google Maps Platform requires billing even when usage stays within any available credit.
4. Open **APIs & Services → Library**.
5. Search for **Places API (New)** and enable it.
6. Open **APIs & Services → Credentials**.
7. Select **Create Credentials → API key**.
8. Edit the new key.
9. Under **API restrictions**, select **Restrict key**, then select only **Places API (New)**.
10. For a fixed production server IP, add an **IP addresses** application restriction. Serverless platforms may use changing outbound IP addresses; if a stable egress IP is unavailable, keep the API restriction, enforce small quotas, and monitor usage.
11. Set conservative quota and billing alerts.

## Add the key locally

Open `.env.local` and add:

```text
GOOGLE_PLACES_API_KEY=your_real_key
```

Restart `npm run dev`, then go to **Dashboard → Integrations**, enable Google Places, and test search from **Leads → Discovery**.

## Add the key in production

In the hosting provider’s Environment Variables screen, add `GOOGLE_PLACES_API_KEY` as a server-only secret and redeploy.

The application sends the key only from a server action, requests a strict field mask, does not cache responses, and stores only the selected Google Place ID. Business details are re-entered as human-observed discovery evidence.

## If search fails

- `REQUEST_DENIED`: confirm Places API (New), billing, and key restrictions.
- `429`: check quota and recent usage.
- Integration remains disabled: confirm the environment variable exists and restart/redeploy.
- Local change has no effect: stop and restart the development server after editing `.env.local`.
