function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function svgCard({ title, subtitle, right, accent = "#1DB954", playing = false }) {
  const w = 495;
  const h = 120;
  const t = esc(title).slice(0, 60);
  const st = esc(subtitle).slice(0, 70);
  const r = esc(right).slice(0, 24);

  const hashSeed = `${title}·${subtitle}`;
  let hash = 0;
  for (let i = 0; i < hashSeed.length; i++) {
    hash = (hash * 31 + hashSeed.charCodeAt(i)) % 1000000000;
  }
  const bars = Array.from({ length: 13 }, (_, i) => {
    hash = (hash * 9301 + 49297) % 233280;
    const barHeight = 10 + Math.floor((hash / 233280) * 42);
    const x = 20 + i * 34;
    const y = h - 20 - barHeight;
    const opacity = 0.28 + ((i % 4) * 0.12);
    return `<rect x="${x}" y="${y}" width="18" height="${barHeight}" rx="4" fill="${accent}" opacity="${opacity.toFixed(2)}"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Spotify now playing">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#0a0f1a"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="url(#bg)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="20" y="20" width="120" height="80" rx="8" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.14)"/>
  <circle cx="34" cy="34" r="6" fill="${playing ? "#1DB954" : "#999"}"/>
  <circle cx="34" cy="34" r="16" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="1.5"/>
  <text x="58" y="40" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="16" fill="rgba(255,255,255,0.92)" font-weight="700">${t}</text>
  <text x="58" y="64" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="13" fill="rgba(255,255,255,0.72)">${st}</text>
  <text x="${w - 18}" y="40" text-anchor="end" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12" fill="rgba(255,255,255,0.55)">${r}</text>
  <text x="18" y="${h - 18}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="11" fill="rgba(255,255,255,0.45)">abhishzk.vercel.app/api/spotify</text>
  ${bars}
</svg>`;
}

function sendSvg(res, svg) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  // GitHub caches images aggressively; keep it fresh but cacheable at the edge.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(svg);
}

async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Spotify token error ${r.status}: ${text}`);
  }
  const json = JSON.parse(text);
  return json.access_token;
}

async function spotifyJson(accessToken, path) {
  const r = await fetch(`https://api.spotify.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await r.text();
  if (r.status === 204) return { status: 204 };
  if (!r.ok) {
    let extracted = "";
    try {
      const parsed = JSON.parse(text);
      extracted = parsed?.error?.message ? String(parsed.error.message) : "";
    } catch {
      // ignore
    }

    const err = new Error(`Spotify API error ${r.status}: ${extracted || text}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return JSON.parse(text);
}

async function spotifyProbe(accessToken, path) {
  try {
    await spotifyJson(accessToken, path);
    return "ok";
  } catch (e) {
    return `${e?.status || "err"} ${String(e?.message || "unknown").slice(0, 90)}`;
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      return res.end("Method Not Allowed");
    }

    const url = new URL(req.url || "/", "http://localhost");
    const mode = url.searchParams.get("mode"); // "recent" to force recently-played

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return sendSvg(
        res,
        svgCard({
          title: "Spotify: setup needed",
          subtitle: "Set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN in Vercel env.",
          right: "env missing",
          accent: "#ef4444"
        })
      );
    }

    const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });

    // Confirm which Spotify account/product this token belongs to.
    let me;
    try {
      me = await spotifyJson(accessToken, "me");
    } catch {
      me = null;
    }
    const product = typeof me?.product === "string" ? me.product : "unknown";
    if (mode === "me") {
      return sendSvg(
        res,
        svgCard({
          title: "Spotify token status",
          subtitle: `Account product: ${product}`,
          right: "debug",
          accent: product === "premium" ? "#22c55e" : "#fbbf24"
        })
      );
    }

    if (mode === "diag") {
      const a = await spotifyProbe(accessToken, "me/player/currently-playing");
      const b = await spotifyProbe(accessToken, "me/player/recently-played?limit=1");
      const c = await spotifyProbe(accessToken, "me/top/tracks?time_range=short_term&limit=1");
      return sendSvg(
        res,
        svgCard({
          title: "Spotify diagnostics",
          subtitle: `current:${a} | recent:${b} | top:${c}`,
          right: "diag",
          accent: "#38bdf8"
        })
      );
    }

    if (mode !== "recent" && mode !== "top") {
      // Prefer currently-playing; for non-Premium accounts Spotify may 403 these endpoints.
      try {
        const now = await spotifyJson(accessToken, "me/player/currently-playing");
        if (now?.item?.name && now?.item?.artists?.length) {
          const artists = now.item.artists.map((a) => a.name).join(", ");
          const isPlaying = !!now.is_playing;
          return sendSvg(
            res,
            svgCard({
              title: now.item.name,
              subtitle: artists,
              right: isPlaying ? "now playing" : "paused",
              accent: "#1DB954",
              playing: isPlaying
            })
          );
        }
      } catch (e) {
        const msg = String(e?.message ?? "");
        const isPremium403 =
          (e?.status === 403 || /\b403\b/.test(msg)) &&
          /premium/i.test(msg);
        const isScope403 =
          (e?.status === 403 || /\b403\b/.test(msg)) &&
          /insufficient.*scope|scope.*insufficient/i.test(msg);
        if (!isPremium403 && !isScope403) throw e;
      }
    }

    if (mode !== "top") {
      // Fallback: recently played (may still require Premium for some accounts/apps).
      try {
        const recent = await spotifyJson(accessToken, "me/player/recently-played?limit=1");
        const track = recent?.items?.[0]?.track;
        if (track?.name && track?.artists?.length) {
          const artists = track.artists.map((a) => a.name).join(", ");
          return sendSvg(
            res,
            svgCard({
              title: track.name,
              subtitle: artists,
              right: "recent",
              accent: "#22c55e",
              playing: true
            })
          );
        }
      } catch (e) {
        const msg = String(e?.message ?? "");
        const isPremium403 =
          (e?.status === 403 || /\b403\b/.test(msg)) &&
          /premium/i.test(msg);
        const isScope403 =
          (e?.status === 403 || /\b403\b/.test(msg)) &&
          /insufficient.*scope|scope.*insufficient/i.test(msg);
        if (!isPremium403 && !isScope403) throw e;
      }
    }

    // Last resort (works without Premium): short-term top track.
    let topTrack = null;
    try {
      const top = await spotifyJson(accessToken, "me/top/tracks?time_range=short_term&limit=1");
      topTrack = top?.items?.[0];
    } catch (e) {
      // Keep fallback behavior when Premium-only endpoints fail.
      console.warn("[api/spotify] top-tracks fallback failed", {
        status: e?.status,
        message: String(e?.message ?? "").slice(0, 300)
      });
    }

    if (topTrack?.name && topTrack?.artists?.length) {
      const artists = topTrack.artists.map((a) => a.name).join(", ");
      return sendSvg(
        res,
        svgCard({
          title: topTrack.name,
          subtitle: artists,
          right: "top track",
          accent: "#38bdf8",
          playing: true
        })
      );
    }

    return sendSvg(
      res,
      svgCard({
        title: "Spotify",
        subtitle: "No track data available right now.",
        right: "idle",
        accent: "#94a3b8"
      })
    );
  } catch (e) {
    const msg = String(e?.message ?? "");
    const needsScope = /insufficient.*scope|scope.*insufficient/i.test(msg);
    // Safe logging for debugging (no secrets/tokens).
    console.error("[api/spotify] failed", {
      status: e?.status,
      message: msg.slice(0, 500)
    });
    return sendSvg(
      res,
      svgCard({
        title: needsScope ? "Spotify: scope missing" : "Spotify",
        subtitle: needsScope
          ? "Request scopes: user-read-currently-playing, user-read-recently-played, user-top-read"
          : "Unable to reach Spotify right now.",
        right: needsScope ? "scope" : "offline",
        accent: needsScope ? "#fbbf24" : "#f97316"
      })
    );
  }
};

