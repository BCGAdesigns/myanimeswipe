// Regenerates public/icon*.{svg,png}, favicon.svg, apple-touch-icon.png and og.png from the logo mark.
// Needs Playwright with Chromium (not a project dependency): node scripts/generate-brand-assets.cjs

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const out = process.argv[2] ?? path.join(__dirname, '..', 'public');
const MARK = `
    <rect x="11" y="10" width="30" height="41" rx="8" fill="#8B5CF6" fill-opacity="0.38" transform="rotate(-13 26 30.5)"/>
    <rect x="22" y="12" width="30" height="41" rx="8" fill="url(#wm-g)" transform="rotate(9 37 32.5)"/>
    <path d="M32.5 25.5 L44 33 L32.5 40.5 Z" fill="#fff" stroke="#fff" stroke-width="3.2" stroke-linejoin="round" transform="rotate(9 37 32.5)"/>`;
const GRAD = `<linearGradient id="wm-g" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#EC4899"/></linearGradient>`;
const BG = `<radialGradient id="bg" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#1D1530"/><stop offset="1" stop-color="#0B0C10"/></radialGradient>`;
// Mark bounding box center is about (30.5, 31.5) in its 64 unit grid.
const icon = ({ rounded, scale }) => {
  const tx = 256 - 30.5 * scale, ty = 256 - 31.5 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${BG}${GRAD}</defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${MARK}
  </g></svg>`;
};
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 56 56"><defs>${GRAD}</defs>${MARK}
</svg>`;
fs.writeFileSync(`${out}/icon.svg`, icon({ rounded: true, scale: 6.6 }));
fs.writeFileSync(`${out}/favicon.svg`, mark);
const og = `<!doctype html><html><head><style>@font-face{font-family:'Plus Jakarta Sans Variable';font-weight:200 800;src:url(file://${path.join(__dirname, '..', 'node_modules')}/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2) format('woff2-variations')}</style></head><body style="margin:0">
<div style="width:1200px;height:630px;background:radial-gradient(1000px 600px at 75% 20%, #2a1748 0%, #0B0C10 60%);display:flex;align-items:center;justify-content:space-between;padding:0 90px;box-sizing:border-box;font-family:'Plus Jakarta Sans Variable',sans-serif;color:#F4F4F6">
  <div>
    <div style="display:flex;align-items:center;gap:18px">
      <svg width="96" height="96" viewBox="4 4 56 56"><defs>${GRAD}</defs>${MARK}</svg>
      <div style="font-size:72px;font-weight:800;letter-spacing:-0.02em">Watch<span style="background:linear-gradient(135deg,#A78BFA,#F472B6);-webkit-background-clip:text;color:transparent">Match</span></div>
    </div>
    <div style="margin-top:28px;font-size:38px;font-weight:600;line-height:1.25;max-width:560px">Dê match no que assistir.</div>
    <div style="margin-top:14px;font-size:26px;color:#9BA1AE;font-weight:500">Anime, filmes, séries e desenhos.<br>Arraste, avalie e receba recomendações.</div>
  </div>
  <div style="position:relative;width:360px;height:470px">
    <div style="position:absolute;inset:0;border-radius:32px;transform:rotate(-12deg) translate(-40px,10px);background:linear-gradient(160deg,#3b2a6b,#1b1730);opacity:.7"></div>
    <div style="position:absolute;inset:0;border-radius:32px;transform:rotate(-4deg) translate(-12px,4px);background:linear-gradient(160deg,#5b3fa8,#24203d);opacity:.85"></div>
    <div style="position:absolute;inset:0;border-radius:32px;transform:rotate(6deg) translate(18px,0);background:linear-gradient(160deg,#8B5CF6,#EC4899);box-shadow:0 30px 80px rgba(0,0,0,.5);display:flex;flex-direction:column;justify-content:flex-end;padding:30px;box-sizing:border-box">
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <span style="padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.22);font-size:20px;font-weight:700">♥ Gostei</span>
        <span style="padding:8px 16px;border-radius:999px;background:rgba(255,255,255,.22);font-size:20px;font-weight:700">★ 9,1</span>
      </div>
      <div style="height:18px;width:80%;border-radius:9px;background:rgba(255,255,255,.55)"></div>
      <div style="height:14px;width:55%;border-radius:7px;background:rgba(255,255,255,.35);margin-top:12px"></div>
    </div>
  </div>
</div></body></html>`;
// The social card is laid out in HTML; keep that page out of the published folder.
const ogPage = path.join(os.tmpdir(), 'watchmatch-og.html');
fs.writeFileSync(ogPage, og);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (svg, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
    await page.screenshot({ path: `${out}/${file}`, omitBackground: true });
  };
  await shot(icon({ rounded: true, scale: 6.6 }), 192, 'icon-192.png');
  await shot(icon({ rounded: true, scale: 6.6 }), 512, 'icon-512.png');
  // Maskable: full bleed, mark inside the 80% safe circle.
  await shot(icon({ rounded: false, scale: 5.2 }), 512, 'icon-maskable-512.png');
  // iOS rounds the corners itself.
  await shot(icon({ rounded: false, scale: 6.0 }), 180, 'apple-touch-icon.png');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto('file://' + ogPage);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/og.png` });
  await browser.close();
})();
