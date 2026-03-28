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

/** Wrap title into 1–2 lines; keeps text in [0, maxLen] char chunks on word boundaries. */
function titleLines(raw, maxLen) {
  const s = esc(raw);
  if (s.length <= maxLen) return [s];
  let cut = s.lastIndexOf(" ", maxLen);
  if (cut < maxLen * 0.45) cut = maxLen;
  const a = s.slice(0, cut).trimEnd();
  let b = s.slice(cut).trimStart();
  if (b.length > maxLen) {
    const cut2 = b.lastIndexOf(" ", maxLen);
    const c = cut2 >= maxLen * 0.4 ? cut2 : maxLen;
    b = b.slice(0, c).trimEnd() + "…";
  }
  return [a, b].filter(Boolean);
}

/**
 * Now-playing: large art + bars, tight inset, title never intrudes on badge column.
 */
function svgNowPlaying({ title, artist, artDataUri, badge, isPlaying }) {
  const w = 920;
  const h = 252;
  const inset = 6;
  const artSize = 204;
  const artX = inset;
  const artY = (h - artSize) / 2;
  const gapArtText = 12;
  const textX = artX + artSize + gapArtText;
  const padR = inset;
  const bRaw = esc(badge || "").slice(0, 18);
  const badgeW = bRaw ? Math.min(158, 30 + bRaw.length * 7.4) : 0;
  const badgeX = w - padR - badgeW;
  const titleColW = badgeX - textX - 14;

  const maxTitleChars = Math.max(28, Math.floor(titleColW / 13.5));
  const lines = titleLines(title, maxTitleChars);
  const a = esc(artist).slice(0, 72);
  const seed = `${title}|${artist}`;
  const barW = 9;
  const gap = 4;
  const vizY = h - 18;
  const vizLeft = artX;
  const vizMaxW = w - 2 * inset;
  const barCount = Math.min(64, Math.floor((vizMaxW + gap) / (barW + gap)));
  const bars = visualizerHeights(seed, Math.max(40, barCount));
  const playing = !!isPlaying;

  const artRx = 16;
  const artClip = `<clipPath id="artClip"><rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="${artRx}"/></clipPath>`;
  const artBlock = artDataUri
    ? `<g clip-path="url(#artClip)"><image href="${artDataUri}" x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" preserveAspectRatio="xMidYMid slice"/></g>`
    : `<rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="${artRx}" fill="#2a2a32"/><text x="${artX + artSize / 2}" y="${artY + artSize / 2 + 10}" text-anchor="middle" font-size="36" fill="rgba(255,255,255,0.22)">♪</text>`;

  let x = vizLeft;
  const barEls = [];
  for (let i = 0; i < bars.length && x + barW < vizLeft + vizMaxW; i++) {
    const bh = bars[i] + 4;
    const h1 = Math.min(58, bh + 12 + (i % 7));
    const dur = (0.48 + (i % 8) * 0.05).toFixed(2);
    const y0 = vizY - bh;
    const y1 = vizY - h1;
    if (playing) {
      barEls.push(
        `<rect x="${x}" y="${y0}" width="${barW}" height="${bh}" rx="2" fill="url(#vizGrad)" opacity="0.94">` +
          `<animate attributeName="height" values="${bh};${h1};${bh}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `<animate attributeName="y" values="${y0};${y1};${y0}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `</rect>`
      );
    } else {
      const bh2 = Math.max(6, Math.round(bh * 0.5));
      barEls.push(
        `<rect x="${x}" y="${vizY - bh2}" width="${barW}" height="${bh2}" rx="2" fill="url(#vizGrad)" opacity="0.58"/>`
      );
    }
    x += barW + gap;
  }

  const badgeCY = 36;
  const showLivePill = bRaw === "now playing" && playing;
  const badgePill = showLivePill
    ? `<rect x="${badgeX}" y="20" width="${badgeW}" height="30" rx="15" fill="rgba(30,215,96,0.18)" stroke="rgba(30,215,96,0.3)" stroke-width="0.75"/>
  <circle cx="${badgeX + 15}" cy="${badgeCY}" r="4" fill="#1ed760"/><text x="${badgeX + 24}" y="${badgeCY + 4}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="12" fill="rgba(240,255,248,0.96)" font-weight="600">${bRaw}</text>`
    : bRaw
      ? `<text x="${w - inset}" y="${badgeCY + 4}" text-anchor="end" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="13" fill="rgba(255,255,255,0.4)">${bRaw}</text>`
      : "";

  const titleY1 = 58;
  const titleY2 = 94;
  const artistY = lines.length > 1 ? 128 : 112;
  const titleBlock =
    lines.length === 1
      ? `<text x="${textX}" y="${titleY1}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="27" fill="#f8f8fc" font-weight="700" letter-spacing="-0.03em">${lines[0]}</text>`
      : `<text x="${textX}" y="${titleY1}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="27" fill="#f8f8fc" font-weight="700" letter-spacing="-0.03em">${lines[0]}</text>
  <text x="${textX}" y="${titleY2}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="27" fill="#f8f8fc" font-weight="700" letter-spacing="-0.03em">${lines[1]}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Spotify now playing">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#12121a"/>
      <stop offset="100%" stop-color="#0b0b10"/>
    </linearGradient>
    <linearGradient id="vizGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d4b896"/>
      <stop offset="35%" stop-color="#5ec4b0"/>
      <stop offset="70%" stop-color="#4a9fd4"/>
      <stop offset="100%" stop-color="#c9a27a"/>
    </linearGradient>
    ${artClip}
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="url(#bg)"/>
  ${artBlock}
  ${titleBlock}
  <text x="${textX}" y="${artistY}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="17" fill="rgba(255,255,255,0.52)">${a}</text>
  ${badgePill}
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
  <rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="url(#bg)"/>
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
