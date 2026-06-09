// node scripts/contrast-check.mjs — WCAG contrast of oklch tokens vs the cream bg.
// oklch → LINEAR sRGB (CSS Color 4 matrix); WCAG relative luminance is computed
// directly from linear light (no gamma round-trip).
function oklchToLinRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const relLum = (L, C, H) => {
  const [r, g, b] = oklchToLinRgb(L, C, H).map((v) => Math.max(0, Math.min(1, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const a = relLum(...fg) + 0.05, b = relLum(...bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
};
// Surfaces text sits on (must match the tokens in app/globals.css).
const cream = [0.965, 0.012, 78];        // light page bg
const surface = [0.992, 0.006, 84];      // light card
const surfaceDark = [0.225, 0.014, 64];  // .dark card
const checks = [
  ["sanity black/white", [0, 0, 0], [1, 0, 0], 21],
  ["OLD mocha 0.58 (text)", [0.58, 0.03, 58], cream, 4.5],
  ["NEW mocha 0.50 (text)", [0.50, 0.03, 58], cream, 4.5],
  ["caramel-deep 0.52 (link text)", [0.52, 0.115, 50], cream, 4.5],
  ["OLD line 0.89 (border)", [0.89, 0.018, 74], cream, 3.0],
  ["NEW control-border 0.63", [0.63, 0.02, 74], cream, 3.0],

  // --- Destructive / error TEXT: --berry (small label text, AA 4.5:1) ---
  ["berry 0.52 (light, on cream)", [0.52, 0.19, 27], cream, 4.5],
  ["berry 0.52 (light, on surface)", [0.52, 0.19, 27], surface, 4.5],
  ["berry 0.72 (dark, on dark card)", [0.72, 0.15, 27], surfaceDark, 4.5],
  ["OLD destructive 0.58 (dark TEXT, on dark card)", [0.58, 0.20, 25], surfaceDark, 4.5],

  // --- Small green status text: --sage-deep (AA 4.5:1) ---
  ["sage-deep 0.48 (light, on cream)", [0.48, 0.07, 145], cream, 4.5],
  ["sage-deep 0.48 (light, on surface)", [0.48, 0.07, 145], surface, 4.5],
  ["sage-deep 0.72 (dark, on dark card)", [0.72, 0.07, 150], surfaceDark, 4.5],
  ["OLD sage 0.62 (light TEXT, on cream)", [0.62, 0.055, 140], cream, 4.5],

  // --- mocha tertiary text in dark mode (lightened) ---
  ["mocha 0.75 (dark, on dark card)", [0.75, 0.022, 70], surfaceDark, 4.5],
];
let fail = 0;
for (const [name, fg, bg, min] of checks) {
  const r = ratio(fg, bg);
  const ok = name.startsWith("OLD") || name.startsWith("sanity") ? true : r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "OK " : "XX "} ${name}: ${r.toFixed(2)}:1 (min ${min})`);
}
process.exit(fail ? 1 : 0);
