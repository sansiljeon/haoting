import { JWT } from "google-auth-library";

// Narrow, purpose-scoped grants rather than the broad "calendar"/"drive" scopes.
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
];

let cachedClient = null;

export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

export function getServiceAccountClient() {
  if (cachedClient) return cachedClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not configured");
  }
  cachedClient = new JWT({ email, key: rawKey.replace(/\\n/g, "\n"), scopes: SCOPES });
  return cachedClient;
}

export async function googleFetch(url, options = {}) {
  const client = getServiceAccountClient();
  const authHeaders = await client.getRequestHeaders();
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Google API ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Returns true and continues if authorized; sends 401 and returns false otherwise.
// Skipped entirely (returns true) when INTERNAL_API_TOKEN itself hasn't been set —
// that's a local/dev convenience, not something to rely on in production.
export function requireInternalToken(req, res) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) return true;
  const provided = req.headers["x-internal-api-token"];
  if (provided === expected) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

export { SCOPES };
