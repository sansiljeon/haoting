import { googleFetch, isGoogleConfigured, requireInternalToken } from "../lib/google-auth.js";
import { requireFirebaseAuth } from "../lib/firebase-auth.js";

// How far back to look on a client's very first pull (no `updatedMin` checkpoint yet).
// Wide enough to catch edits to recently-scheduled sessions without listing the whole calendar.
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 5; // guards against a runaway loop; a small tutoring calendar never needs this many

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

  const defaultUpdatedMin = new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();
  const updatedMinParam = String(req.query?.updatedMin || "").trim();
  const updatedMin =
    updatedMinParam && !Number.isNaN(Date.parse(updatedMinParam)) ? updatedMinParam : defaultUpdatedMin;

  // Read is captured before the request so events edited while we're paginating
  // are still safely covered by the next poll instead of silently skipped.
  const syncedAt = new Date().toISOString();

  try {
    let events;
    try {
      events = await fetchAllEvents(calendarId, updatedMin);
    } catch (err) {
      // Google rejects an `updatedMin` that's too far in the past (410 updatedMinTooLongAgo),
      // which happens when a client's stored checkpoint goes stale (e.g. long absence). Without
      // this fallback the client never gets a fresh syncedAt to save, so it resends the same bad
      // value and 502s forever. Retry once with the default window instead of hard-failing.
      if (err?.status === 410 && updatedMin !== defaultUpdatedMin) {
        events = await fetchAllEvents(calendarId, defaultUpdatedMin);
      } else {
        throw err;
      }
    }
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
