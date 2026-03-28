function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Stable pseudo-random bar heights for visualizer (changes when track changes). */
function visualizerHeights(seedStr, count) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(5 + (h % 18));
  }
  return out;
}

async function fetchImageAsDataUri(imageUrl) {
  if (!imageUrl) return null;
  try {
    const r = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 900_000) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function pickAlbumImageUrl(album) {
  const imgs = album?.images;
  if (!Array.isArray(imgs) || !imgs.length) return null;
  const sorted = [...imgs].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url || imgs[0]?.url || null;
}

/**
 * Now-playing card: art left, title/artist, gradient bars. Bars animate when isPlaying (SMIL).
 */
function svgNowPlaying({ title, artist, artDataUri, badge, isPlaying }) {
  const w = 680;
  const h = 168;
  const pad = 18;
  const artSize = 124;
  const artX = pad;
  const artY = (h - artSize) / 2;
  const textX = artX + artSize + 20;
  const t = esc(title).slice(0, 48);
  const a = esc(artist).slice(0, 52);
  const b = esc(badge || "").slice(0, 16);
  const seed = `${title}|${artist}`;
  const barW = 6;
  const gap = 3;
  const vizY = h - 32;
  const vizLeft = textX;
  const vizMaxW = w - textX - pad;
  const barCount = Math.min(48, Math.floor((vizMaxW + gap) / (barW + gap)));
  const bars = visualizerHeights(seed, Math.max(32, barCount));

  const artClip = `<clipPath id="artClip"><rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="12"/></clipPath>`;
  const artBlock = artDataUri
    ? `<g clip-path="url(#artClip)"><image href="${artDataUri}" x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" preserveAspectRatio="xMidYMid slice"/></g><rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="12" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>`
    : `<rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="12" fill="#1a1a24" stroke="rgba(255,255,255,0.12)"/><text x="${artX + artSize / 2}" y="${artY + artSize / 2 + 7}" text-anchor="middle" font-size="28" fill="rgba(255,255,255,0.28)">♪</text>`;

  let x = vizLeft;
  const barEls = [];
  const playing = !!isPlaying;
  for (let i = 0; i < bars.length && x + barW < vizLeft + vizMaxW; i++) {
    const bh = bars[i];
    const h1 = Math.min(44, bh + 10 + (i % 6));
    const dur = (0.5 + (i % 8) * 0.05).toFixed(2);
    const y0 = vizY - bh;
    const y1 = vizY - h1;
    if (playing) {
      barEls.push(
        `<rect x="${x}" y="${y0}" width="${barW}" height="${bh}" rx="1.5" fill="url(#vizGrad)" opacity="0.92">` +
          `<animate attributeName="height" values="${bh};${h1};${bh}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `<animate attributeName="y" values="${y0};${y1};${y0}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `</rect>`
      );
    } else {
      const bh2 = Math.max(4, Math.round(bh * 0.55));
      barEls.push(
        `<rect x="${x}" y="${vizY - bh2}" width="${barW}" height="${bh2}" rx="1.5" fill="url(#vizGrad)" opacity="0.55"/>`
      );
    }
    x += barW + gap;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Spotify now playing">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14141c"/>
      <stop offset="100%" stop-color="#0c0c12"/>
    </linearGradient>
    <linearGradient id="vizGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#c4a574"/>
      <stop offset="45%" stop-color="#5b9aa8"/>
      <stop offset="100%" stop-color="#a67c52"/>
    </linearGradient>
    ${artClip}
  </defs>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="18" fill="url(#bg)" stroke="rgba(255,255,255,0.1)"/>
  ${artBlock}
  <text x="${textX}" y="56" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="22" fill="rgba(255,255,255,0.96)" font-weight="650">${t}</text>
  <text x="${textX}" y="88" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="16" fill="rgba(255,255,255,0.64)">${a}</text>
  ${b ? `<text x="${w - pad}" y="48" text-anchor="end" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12" fill="rgba(255,255,255,0.42)">${b}</text>` : ""}
  <g>${barEls.join("")}</g>
</svg>`;
}

function svgCard({ title, subtitle, right, accent = "#1DB954" }) {
  const w = 495;
  const h = 120;
  const t = esc(title).slice(0, 60);
  const st = esc(subtitle).slice(0, 70);
  const r = esc(right).slice(0, 24);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Spotify">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#0a0f1a"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="url(#bg)" stroke="rgba(255,255,255,0.12)"/>
  <circle cx="34" cy="34" r="12" fill="${accent}"/>
  <path d="M30 30c6 0 10 4 10 10" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linecap="round"/>
  <path d="M28 34c5 0 8 3 8 8" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2" stroke-linecap="round"/>
  <text x="58" y="40" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="16" fill="rgba(255,255,255,0.92)" font-weight="700">${t}</text>
  <text x="58" y="66" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="13" fill="rgba(255,255,255,0.72)">${st}</text>
  <text x="${w - 18}" y="40" text-anchor="end" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12" fill="rgba(255,255,255,0.55)">${r}</text>
</svg>`;
}

function sendSvg(res, svg) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(svg);
}

function isInsufficientScope(err) {
  const m = String(err?.message ?? err?.body ?? "");
  return /insufficient client scope|insufficient_scope/i.test(m) || /403.*scope/i.test(m);
}

function isPremium403(err) {
  const msg = String(err?.message ?? "");
  return (err?.status === 403 || /\b403\b/.test(msg)) && /premium/i.test(msg);
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

async function respondWithTrack(res, track, { badge, isPlaying }) {
  const artists = track.artists.map((x) => x.name).join(", ");
  const artUrl = pickAlbumImageUrl(track.album);
  const artDataUri = await fetchImageAsDataUri(artUrl);
  return sendSvg(
    res,
    svgNowPlaying({
      title: track.name,
      artist: artists,
      artDataUri,
      badge,
      isPlaying: !!isPlaying
    })
  );
}

module.exports = async (req, res) => {
  try {
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      return res.end("Method Not Allowed");
    }

    const url = new URL(req.url || "/", "http://localhost");
    const rawMode = url.searchParams.get("mode");
    // Never use top-tracks for the widget. Old READMEs used ?mode=top — treat like default.
    const mode = rawMode === "top" ? null : rawMode;

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
      return sendSvg(
        res,
        svgCard({
          title: "Spotify diagnostics",
          subtitle: `current:${a} | recent:${b}`,
          right: "diag",
          accent: "#38bdf8"
        })
      );
    }

    let sawInsufficientScope = false;

    if (mode !== "recent") {
      try {
        const now = await spotifyJson(accessToken, "me/player/currently-playing");
        if (now?.item?.name && now?.item?.artists?.length) {
          const playing = !!now.is_playing;
          return respondWithTrack(res, now.item, {
            badge: playing ? "now playing" : "paused",
            isPlaying: playing
          });
        }
      } catch (e) {
        if (isInsufficientScope(e)) sawInsufficientScope = true;
        else if (!isPremium403(e)) throw e;
      }
    }

    try {
      const recent = await spotifyJson(accessToken, "me/player/recently-played?limit=1");
      const track = recent?.items?.[0]?.track;
      if (track?.name && track?.artists?.length) {
        return respondWithTrack(res, track, {
          badge: "last played",
          isPlaying: false
        });
      }
    } catch (e) {
      if (isInsufficientScope(e)) sawInsufficientScope = true;
      else if (!isPremium403(e)) throw e;
    }

    if (sawInsufficientScope) {
      return sendSvg(
        res,
        svgCard({
          title: "Spotify: reconnect needed",
          subtitle:
            "Re-authorize with scopes: user-read-currently-playing user-read-recently-played user-read-playback-state",
          right: "scope",
          accent: "#f97316"
        })
      );
    }

    return sendSvg(
      res,
      svgNowPlaying({
        title: "Nothing playing",
        artist: "Play something on Spotify — or check back in a minute",
        artDataUri: null,
        badge: "",
        isPlaying: false
      })
    );
  } catch (e) {
    const msg = String(e?.message ?? "");
    const isPremium = /premium/i.test(msg);
    const isScope = isInsufficientScope(e);
    console.error("[api/spotify] failed", {
      status: e?.status,
      message: msg.slice(0, 500)
    });
    if (isScope) {
      return sendSvg(
        res,
        svgCard({
          title: "Spotify: reconnect needed",
          subtitle:
            "Re-authorize with scopes: user-read-currently-playing user-read-recently-played user-read-playback-state",
          right: "scope",
          accent: "#f97316"
        })
      );
    }
    return sendSvg(
      res,
      svgCard({
        title: isPremium ? "Spotify: Premium required" : "Spotify: error",
        subtitle: isPremium
          ? "Your Spotify account needs Premium for these endpoints."
          : e?.message || "Unknown error",
        right: isPremium ? "upgrade" : "error",
        accent: isPremium ? "#fbbf24" : "#f97316"
      })
    );
  }
};
