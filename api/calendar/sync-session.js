import { googleFetch, isGoogleConfigured, requireInternalToken } from "../lib/google-auth.js";
import { requireFirebaseAuth } from "../lib/firebase-auth.js";

const TIMEZONE = "Asia/Seoul";

function eventsBaseUrl(calendarId) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

function buildEventBody({ studentName, instructor, location, curriculum, sessionNumber, sessionDate, startTime, endTime }) {
  return {
    // "[강사] 학생명 N회차" 형식을 고정합니다 — 캘린더에서 직접 만든 일정도 같은 형식이면
    // 회차 번호로 역매칭되므로(public/app.js parseCalendarEventTitle), 이 형식이 두 방향
    // 동기화의 계약입니다.
    summary: `[${instructor || "미배정"}] ${studentName} ${sessionNumber}회차`,
    location: location || undefined,
    description: [curriculum ? `커리큘럼: ${curriculum}` : null, `${sessionNumber}회차`].filter(Boolean).join("\n"),
    start: { dateTime: `${sessionDate}T${startTime}:00`, timeZone: TIMEZONE },
    end: { dateTime: `${sessionDate}T${endTime}:00`, timeZone: TIMEZONE },
  };
}

async function upsertEvent(calendarId, calendarEventId, body) {
  const json = JSON.stringify(body);
  try {
    if (calendarEventId) {
      return await googleFetch(`${eventsBaseUrl(calendarId)}/${calendarEventId}`, { method: "PATCH", body: json });
    }
    return await googleFetch(eventsBaseUrl(calendarId), { method: "POST", body: json });
  } catch (err) {
    // The event may have been deleted/edited away directly in Calendar since we last
    // stored its id — fall back to creating a fresh one instead of staying stuck.
    if (calendarEventId && (err.status === 404 || err.status === 410)) {
      return googleFetch(eventsBaseUrl(calendarId), { method: "POST", body: json });
    }
    throw err;
  }
}

async function deleteEvent(calendarId, calendarEventId) {
  try {
    await googleFetch(`${eventsBaseUrl(calendarId)}/${calendarEventId}`, { method: "DELETE" });
  } catch (err) {
    if (err.status !== 404 && err.status !== 410) throw err; // already gone = fine
  }
}

export default async function handler(req, res) {
  if (!(await requireFirebaseAuth(req, res))) return;
  if (!requireInternalToken(req, res)) return;

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!isGoogleConfigured() || !calendarId) {
    res.status(200).json({ skipped: true, reason: "calendar sync not configured" });
    return;
  }

  try {
    if (req.method === "POST") {
      const { calendarEventId, ...fields } = req.body || {};
      const result = await upsertEvent(calendarId, calendarEventId, buildEventBody(fields));
      res.status(200).json({ eventId: result.id });
      return;
    }
    if (req.method === "DELETE") {
      const { calendarEventId } = req.body || {};
      if (!calendarEventId) {
        res.status(400).json({ error: "calendarEventId required" });
        return;
      }
      await deleteEvent(calendarId, calendarEventId);
      res.status(200).json({ deleted: true });
      return;
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    console.error("[api/calendar/sync-session]", err);
    res.status(502).json({ error: "calendar sync failed" });
  }
}
