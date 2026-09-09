import { googleFetch, isGoogleConfigured, requireInternalToken } from "../lib/google-auth.js";
import { requireFirebaseAuth } from "../lib/firebase-auth.js";

const MAX_PAGES = 5; // guards against a runaway loop; a small tutoring calendar never needs this many

// How far back to look on a client's very first pull (no `updatedMin` checkpoint yet), and what
// to fall back to when a checkpoint is rejected. Google enforces an *undocumented,
// calendar-specific* retention window on how far back `updatedMin` may reach (410
// updatedMinTooLongAgo beyond it) — it isn't a fixed number we can hardcode, so instead of
// guessing one value we fall back through progressively shorter windows until one is accepted.
const FALLBACK_LOOKBACKS_MS = [
  30 * 24 * 60 * 60 * 1000, // 30 days
  3 * 24 * 60 * 60 * 1000, // 3 days
  24 * 60 * 60 * 1000, // 1 day
  60 * 60 * 1000, // 1 hour
];

function eventsBaseUrl(calendarId) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

export default async function handler(req, res) {
  if (!(await requireFirebaseAuth(req, res))) return;
  if (!requireInternalToken(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!isGoogleConfigured() || !calendarId) {
    res.status(200).json({ skipped: true, reason: "calendar sync not configured" });
    return;
  }

  const updatedMinParam = String(req.query?.updatedMin || "").trim();
  const clientUpdatedMin =
    updatedMinParam && !Number.isNaN(Date.parse(updatedMinParam)) ? updatedMinParam : null;
  const candidates = [
    ...(clientUpdatedMin ? [clientUpdatedMin] : []),
    ...FALLBACK_LOOKBACKS_MS.map((ms) => new Date(Date.now() - ms).toISOString()),
  ];

  // Read is captured before the request so events edited while we're paginating
  // are still safely covered by the next poll instead of silently skipped.
  const syncedAt = new Date().toISOString();

  try {
    let events;
    let lastErr;
    for (const candidate of candidates) {
      try {
        events = await fetchAllEvents(calendarId, candidate);
        lastErr = null;
        break;
      } catch (err) {
        // A stale/too-old `updatedMin` (410 updatedMinTooLongAgo) is the one failure mode worth
        // retrying with a narrower window — anything else (auth, network, quota) won't be fixed
        // by shrinking the range, so surface it immediately instead of burning through candidates.
        if (err?.status !== 410) throw err;
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;
    res.status(200).json({ events, syncedAt });
  } catch (err) {
    console.error("[api/calendar/list-changes]", err);
    res.status(502).json({ error: "calendar list failed" });
  }
}

async function fetchAllEvents(calendarId, updatedMin) {
  const events = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      updatedMin,
      showDeleted: "true",
      singleEvents: "true",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleFetch(`${eventsBaseUrl(calendarId)}?${params.toString()}`, { method: "GET" });
    (data?.items || []).forEach((item) => {
      events.push({
        id: item.id,
        status: item.status,
        summary: item.summary || "",
        start: item.start || null,
        end: item.end || null,
      });
    });
    pageToken = data?.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}
