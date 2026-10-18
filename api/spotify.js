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

const FONT = "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial";

/** Shrinks the font before truncating so long titles stay on one line. */
function fitText(raw, maxWidth, maxSize, minSize, charW) {
  const s = String(raw ?? "");
  let size = maxSize;
  while (size > minSize && s.length * size * charW > maxWidth) size -= 1;
  const maxChars = Math.floor(maxWidth / (size * charW));
  const text = s.length > maxChars ? s.slice(0, Math.max(1, maxChars - 1)).trimEnd() + "…" : s;
  return { text: esc(text), size };
}

/**
 * Now playing card: art on the left, text and an art-tinted equalizer on the right.
 * Bars are masks over a blurred copy of the cover, so each track gets its own colors.
 */
function svgNowPlaying({ title, artist, artDataUri, isPlaying, status }) {
  const w = 920;
  const h = 300;
  const pad = 28;
  const artSize = h - pad * 2;
  const artX = pad;
  const artY = pad;
  const textX = artX + artSize + pad;
  const colW = w - pad - textX;
  const playing = !!isPlaying;

  const t = fitText(title, colW, 36, 24, 0.56);
  const a = fitText(artist, colW, 21, 16, 0.5);
  const alb = fitText((status || "").replace(/^Listening now\s+·\s+/, ""), colW, 15, 13, 0.5);


  const titleY = 76;
  const artistY = 110;
  const albumY = 136;
  const dividerY = 160;
  const baseY = 262;
  const maxBarH = 86;
  const minBarH = 14;
  const barW = 8;
  const gap = 4;
  const count = Math.floor((colW + gap) / (barW + gap));

  const seed = `${title}|${artist}`;
  const hA = visualizerHeights(seed, count);
  const hB = visualizerHeights(seed + "b", count);
  const hC = visualizerHeights(seed + "c", count);
  const norm = (v) => (v - 10) / 27;
  const barH = (v, i, phase) => {
    const env = 0.5 + 0.5 * Math.sin(i * 0.42 + phase);
    return Math.round(minBarH + (maxBarH - minBarH) * (0.4 * norm(v) + 0.6 * env));
  };

  const bars = [];
  for (let i = 0; i < count; i++) {
    const x = textX + i * (barW + gap);
    const h0 = barH(hA[i], i, 0);
    if (playing) {
      const h1 = barH(hB[i], i, 2.1);
      const h2 = barH(hC[i], i, 4.2);
      const dur = (1.1 + (i % 7) * 0.13).toFixed(2);
      const begin = (-(i % 5) * 0.21).toFixed(2);
      const hs = `${h0};${h1};${h2};${h0}`;
      const ys = `${baseY - h0};${baseY - h1};${baseY - h2};${baseY - h0}`;
      const common = `dur="${dur}s" begin="${begin}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.33;0.66;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"`;
      bars.push(
        `<rect x="${x}" y="${baseY - h0}" width="${barW}" height="${h0}" rx="4" fill="#fff">` +
          `<animate attributeName="height" values="${hs}" ${common}/>` +
          `<animate attributeName="y" values="${ys}" ${common}/></rect>`
      );
    } else {
      bars.push(`<rect x="${x}" y="${baseY - h0}" width="${barW}" height="${h0}" rx="4" fill="#fff"/>`);
    }
  }

  const art = artDataUri
    ? `<image href="${artDataUri}" x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" fill="#23232c"/><text x="${artX + artSize / 2}" y="${artY + artSize / 2 + 16}" text-anchor="middle" font-size="52" fill="rgba(255,255,255,0.22)">♪</text>`;

  const backdrop = artDataUri
    ? `<g clip-path="url(#cardClip)">
    <image href="${artDataUri}" x="-40" y="-40" width="${w + 80}" height="${h + 80}" preserveAspectRatio="xMidYMid slice" filter="url(#blurBig)" opacity="0.5"/>
    <rect width="${w}" height="${h}" fill="url(#scrim)"/>
  </g>`
    : `<rect width="${w}" height="${h}" rx="22" fill="url(#bg)"/>`;

  const colorField = artDataUri
    ? `<image href="${artDataUri}" x="${textX}" y="${baseY - maxBarH}" width="${colW}" height="${maxBarH}" preserveAspectRatio="xMidYMid slice" filter="url(#vivid)"/>
    <rect x="${textX}" y="${baseY - maxBarH}" width="${colW}" height="${maxBarH}" fill="url(#brand)" opacity="0.18"/>`
    : `<rect x="${textX}" y="${baseY - maxBarH}" width="${colW}" height="${maxBarH}" fill="url(#brand)"/>`;

  const barsGroup = `<g mask="url(#barsMask)">${colorField}</g>`;
  const reflection = `<g opacity="0.24" mask="url(#reflectFade)"><g transform="translate(0 ${baseY * 2 + 3}) scale(1 -1)"><g mask="url(#barsMask)">${colorField}</g></g></g>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Now playing">
  <defs>
    <clipPath id="cardClip"><rect width="${w}" height="${h}" rx="22"/></clipPath>
    <clipPath id="artClip"><rect x="${artX}" y="${artY}" width="${artSize}" height="${artSize}" rx="20"/></clipPath>
    <filter id="blurBig" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="38"/>
      <feColorMatrix type="saturate" values="1.3"/>
    </filter>
    <filter id="vivid" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="16" edgeMode="duplicate"/>
      <feColorMatrix type="saturate" values="1.9"/>
      <feComponentTransfer><feFuncR type="linear" slope="1.15" intercept="0.04"/><feFuncG type="linear" slope="1.15" intercept="0.04"/><feFuncB type="linear" slope="1.15" intercept="0.04"/></feComponentTransfer>
    </filter>
    <filter id="artShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.55"/></filter>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0c0c11"/><stop offset="1" stop-color="#050507"/></linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(4,4,7,0.78)"/><stop offset="1" stop-color="rgba(2,2,4,0.92)"/></linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1ed760"/><stop offset="0.5" stop-color="#5ac8ff"/><stop offset="1" stop-color="#a06bff"/></linearGradient>
    <linearGradient id="divider" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(255,255,255,0.28)"/><stop offset="1" stop-color="rgba(255,255,255,0)"/></linearGradient>
    <linearGradient id="fadeDown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="barsMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><g>${bars.join("")}</g></mask>
    <mask id="reflectFade" maskUnits="userSpaceOnUse" x="0" y="${baseY}" width="${w}" height="${h - baseY}">
      <rect x="0" y="${baseY}" width="${w}" height="${h - baseY}" fill="url(#fadeDown)"/>
    </mask>
  </defs>
  ${backdrop}
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="21.5" fill="none" stroke="rgba(255,255,255,0.09)"/>
  <g filter="url(#artShadow)"><g clip-path="url(#artClip)">${art}</g></g>
  <rect x="${artX + 0.5}" y="${artY + 0.5}" width="${artSize - 1}" height="${artSize - 1}" rx="19.5" fill="none" stroke="rgba(255,255,255,0.12)"/>
  <text x="${textX}" y="${titleY}" font-family="${FONT}" font-size="${t.size}" font-weight="800" letter-spacing="-0.025em" fill="#fafafe">${t.text}</text>
  <text x="${textX}" y="${artistY}" font-family="${FONT}" font-size="${a.size}" font-weight="600" fill="rgba(255,255,255,0.74)">${a.text}</text>
  ${alb.text ? `<text x="${textX}" y="${albumY}" font-family="${FONT}" font-size="${alb.size}" fill="rgba(255,255,255,0.4)">${alb.text}</text>` : ""}
  <rect x="${textX}" y="${dividerY}" width="${colW}" height="1.5" rx="0.75" fill="url(#divider)"/>
  <g opacity="${playing ? 1 : 0.6}">${barsGroup}</g>
  ${reflection}
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
