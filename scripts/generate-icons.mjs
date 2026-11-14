// Generates the PWA and Apple icons from the Perkly mark.
// Run: npm run icons
// Keep the geometry in sync with src/components/shared/logo.tsx.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const OUT = new URL("../public/icons/", import.meta.url);

/** The mark on a 48-unit grid. `padding` shrinks it inside the canvas. */
function markSvg({ size, padding = 0, rounded = true }) {
  const inner = 48 - padding * 2;
  const scale = inner / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="${rounded ? 14 : 0}" fill="#0066FF"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <rect x="13" y="12" width="6.5" height="26" rx="3.25" fill="#FFFFFF"/>
    <circle cx="24.5" cy="20.5" r="7" fill="none" stroke="#FFFFFF" stroke-width="6.5"/>
    <circle cx="35" cy="35.5" r="4.5" fill="#FF6B35"/>
  </g>
</svg>`;
}

async function png(name, svg, size) {
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(name, OUT), buffer);
  console.log(`✓ ${name} (${size}×${size}, ${buffer.length} bytes)`);
}

await mkdir(OUT, { recursive: true });

// "any" icons: rounded square, as on the site.
await png("icon-192.png", markSvg({ size: 192 }), 192);
await png("icon-512.png", markSvg({ size: 512 }), 512);
await png("favicon-32.png", markSvg({ size: 32 }), 32);

// Maskable: full-bleed background, artwork inside the 80% safe zone.
await png("icon-maskable-512.png", markSvg({ size: 512, padding: 7, rounded: false }), 512);

// Apple touch icon: iOS rounds corners itself, so use a full square.
await png("apple-touch-icon.png", markSvg({ size: 180, padding: 4, rounded: false }), 180);

await writeFile(new URL("icon.svg", OUT), markSvg({ size: 48 }));
console.log("✓ icon.svg");
