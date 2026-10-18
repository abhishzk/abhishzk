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
    out.push(10 + (h % 28));
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
function svgNowPlaying({ title, artist, artDataUri, badge, isPlaying, status }) {
  const w = 920;
  const inset = 6;
  const barStripH = 180;
  const mainH = 216;
  const h = mainH + barStripH;
  const barStripY = mainH;

  const artSize = 200;
  const artX = inset;
  const artY = (mainH - artSize) / 2;
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
  const barW = 10;
  const gap = 4;
  const vizBaseline = h - 12;
  const vizLeft = textX;
  const vizMaxW = w - inset - textX;
  const barCount = Math.min(56, Math.floor((vizMaxW + gap) / (barW + gap)));
  const bars = visualizerHeights(seed, Math.max(36, barCount));
  const playing = !!isPlaying;
  const maxBarH = barStripH - 14;

  const artRx = 16;
  const cardClip = `<clipPath id="cardClip"><rect x="0" y="0" width="${w}" height="${h}" rx="18"/></clipPath>`;
  const artClip = `<clipPath id="artClip"><rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="${artRx}"/></clipPath>`;
  const barStripClip = `<clipPath id="barStripClip"><rect x="${textX}" y="${barStripY}" width="${w - textX - inset}" height="${barStripH}"/></clipPath>`;
  const dynamicBack =
    artDataUri &&
    `<g clip-path="url(#cardClip)">
    <image href="${artDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.48"/>
    <image href="${artDataUri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" filter="url(#artBlur)" opacity="0.3"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#scrim)"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#toneTint)"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#fadeEdge)"/>
  </g>`;
  const artBlock = artDataUri
    ? `<g clip-path="url(#artClip)"><image href="${artDataUri}" x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" preserveAspectRatio="xMidYMid slice"/></g>`
    : `<rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="${artRx}" fill="#2a2a32"/><text x="${artX + artSize / 2}" y="${artY + artSize / 2 + 10}" text-anchor="middle" font-size="36" fill="rgba(255,255,255,0.22)">♪</text>`;

  let x = vizLeft;
  const barEls = [];
  for (let i = 0; i < bars.length && x + barW < vizLeft + vizMaxW; i++) {
    const bh = Math.min(maxBarH, Math.round(bars[i] * 2 + 18));
    const h1 = Math.min(maxBarH, bh + 20 + (i % 10));
    const dur = (0.45 + (i % 8) * 0.05).toFixed(2);
    const y0 = vizBaseline - bh;
    const y1 = vizBaseline - h1;
    if (playing) {
      barEls.push(
        `<rect x="${x}" y="${y0}" width="${barW}" height="${bh}" rx="2.5" fill="url(#vizGrad)" opacity="0.96">` +
          `<animate attributeName="height" values="${bh};${h1};${bh}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `<animate attributeName="y" values="${y0};${y1};${y0}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `</rect>`
      );
    } else {
      barEls.push(
        `<rect x="${x}" y="${y0}" width="${barW}" height="${bh}" rx="2.5" fill="url(#vizGrad)" opacity="0.96">` +
          `<animate attributeName="height" values="${bh};${h1};${bh}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `<animate attributeName="y" values="${y0};${y1};${y0}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" keyTimes="0;0.5;1"/>` +
          `</rect>`
      );
    }
    x += barW + gap;
  }

  const badgePill = "";

  const titleY1 = 52;
  const titleY2 = 88;
  const artistY = lines.length > 1 ? 118 : 102;
  const titleBlock =
    lines.length === 1
      ? `<text x="${textX}" y="${titleY1}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="27" fill="#f8f8fc" font-weight="700" letter-spacing="-0.03em">${lines[0]}</text>`
      : `<text x="${textX}" y="${titleY1}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="27" fill="#f8f8fc" font-weight="700" letter-spacing="-0.03em">${lines[0]}</text>
  <text x="${textX}" y="${titleY2}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="27" fill="#f8f8fc" font-weight="700" letter-spacing="-0.03em">${lines[1]}</text>`;

  const statusLine = status
    ? `<text x="${textX}" y="${artistY + 30}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="14" fill="${playing ? "#7ee2a8" : "rgba(255,255,255,0.4)"}">${esc(status).slice(0, 90)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Now playing">
  <defs>
    <filter id="artBlur" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="46"/>
    </filter>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#12121a"/>
      <stop offset="100%" stop-color="#0b0b10"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(6,6,10,0.72)"/>
      <stop offset="100%" stop-color="rgba(6,6,10,0.58)"/>
    </linearGradient>
    <linearGradient id="fadeEdge" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.5)"/>
      <stop offset="22%" stop-color="rgba(0,0,0,0.12)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <linearGradient id="toneTint" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(30,215,96,0.1)"/>
      <stop offset="42%" stop-color="rgba(90,190,255,0.14)"/>
      <stop offset="100%" stop-color="rgba(140,90,255,0.1)"/>
    </linearGradient>
    <linearGradient id="vizGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.92)"/>
      <stop offset="40%" stop-color="rgba(180,240,230,0.88)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.75)"/>
    </linearGradient>
    ${cardClip}
    ${artClip}
    ${barStripClip}
  </defs>
  ${dynamicBack || `<rect x="0" y="0" width="${w}" height="${h}" rx="18" fill="url(#bg)"/><rect x="0" y="0" width="${w}" height="${h}" fill="url(#toneTint)"/><rect x="0" y="0" width="${w}" height="${h}" fill="url(#fadeEdge)"/>`}
  ${artBlock}
  ${titleBlock}
  <text x="${textX}" y="${artistY}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="17" fill="rgba(255,255,255,0.52)">${a}</text>
  ${statusLine}
  ${badgePill}
  <g clip-path="url(#barStripClip)">${barEls.join("")}</g>
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

const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

function pickLastfmImageUrl(images) {
  if (!Array.isArray(images)) return null;
  const order = ["extralarge", "large", "medium", "small"];
  for (const size of order) {
    const url = images.find((i) => i.size === size)?.["#text"];
    if (url && !url.includes(LASTFM_PLACEHOLDER)) return url;
  }
  return null;
}

async function getLatestTrack({ apiKey, user }) {
  const qs = new URLSearchParams({
    method: "user.getrecenttracks",
    user,
    api_key: apiKey,
    limit: "1",
    format: "json"
  });
  const r = await fetch(`https://ws.audioscrobbler.com/2.0/?${qs}`, {
    signal: AbortSignal.timeout(8000)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Last.fm error ${r.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (json.error) throw new Error(`Last.fm error ${json.error}: ${json.message}`);
  const t = json?.recenttracks?.track;
  const track = Array.isArray(t) ? t[0] : t;
  if (!track?.name) return null;
  return {
    title: track.name,
    artist: track.artist?.["#text"] || track.artist?.name || "",
    album: track.album?.["#text"] || "",
    artUrl: pickLastfmImageUrl(track.image),
    isPlaying: track["@attr"]?.nowplaying === "true"
  };
}

function statusText(track) {
  if (track.isPlaying) return track.album ? `Listening now  \u00b7  ${track.album}` : "Listening now";
  return track.album;
}

module.exports = async (req, res) => {
  try {
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      return res.end("Method Not Allowed");
    }

    const apiKey = process.env.LASTFM_API_KEY?.trim();
    const user = process.env.LASTFM_USER?.trim();

    if (!apiKey || !user) {
      return sendSvg(
        res,
        svgCard({
          title: "Now playing: setup needed",
          subtitle: "Set LASTFM_API_KEY / LASTFM_USER in Vercel env.",
          right: "env missing",
          accent: "#ef4444"
        })
      );
    }

    const track = await getLatestTrack({ apiKey, user });
    if (!track) {
      return sendSvg(
        res,
        svgNowPlaying({
          title: "Nothing playing",
          artist: "Play something on Spotify, or check back in a minute",
          artDataUri: null,
          badge: "",
          isPlaying: false
        })
      );
    }

    const artDataUri = await fetchImageAsDataUri(track.artUrl);
    return sendSvg(
      res,
      svgNowPlaying({
        title: track.title,
        artist: track.artist,
        artDataUri,
        badge: "",
        isPlaying: track.isPlaying,
        status: statusText(track)
      })
    );
  } catch (e) {
    const msg = String(e?.message ?? "");
    console.error("[api/spotify] failed", { message: msg.slice(0, 500) });
    return sendSvg(
      res,
      svgCard({
        title: "Now playing: error",
        subtitle: msg || "Unknown error",
        right: "error",
        accent: "#f97316"
      })
    );
  }
};
