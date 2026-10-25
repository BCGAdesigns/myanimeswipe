// Read-only TMDB proxy: keeps the TMDB credential server-side and only forwards the
// endpoints the app uses. Deployed with verify_jwt = false so signed-out users can browse.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

let cachedToken = Deno.env.get("TMDB_READ_TOKEN") ?? "";

/** Function secret first; otherwise the copy kept in Vault (see migration tmdb_token_from_vault). */
async function tmdbToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return "";
  const res = await fetch(`${url}/rest/v1/rpc/tmdb_token`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.ok) cachedToken = (await res.json()) ?? "";
  return cachedToken;
}

const ALLOWED_PATHS = [
  /^\/discover\/(movie|tv)$/,
  /^\/(movie|tv)\/\d+\/recommendations$/,
  /^\/genre\/(movie|tv)\/list$/,
  /^\/watch\/providers\/(movie|tv)$/,
];

// Browsers on other sites can't use the proxy; scripts can spoof Origin, so this is not auth.
const ALLOWED_ORIGINS = [
  /^https:\/\/myanimeswipe(-[a-z0-9-]+)?\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some((r) => r.test(origin)) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405, cors);
  if (origin && cors["Access-Control-Allow-Origin"] === "null") {
    return json({ error: "origin not allowed" }, 403, cors);
  }
  const token = await tmdbToken();
  if (!token) return json({ error: "tmdb_not_configured" }, 503, cors);

  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";
  if (!ALLOWED_PATHS.some((r) => r.test(path))) return json({ error: "path not allowed" }, 400, cors);

  const target = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [key, value] of url.searchParams) {
    if (key !== "path" && key !== "api_key") target.searchParams.set(key, value);
  }
  if (!target.searchParams.has("language")) target.searchParams.set("language", "pt-BR");

  // Accepts either the v4 read access token (a JWT) or the short v3 API key.
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token.startsWith("eyJ")) headers.Authorization = `Bearer ${token}`;
  else target.searchParams.set("api_key", token);

  const res = await fetch(target, { headers });
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": res.ok ? "public, max-age=3600" : "no-store",
    },
  });
});
