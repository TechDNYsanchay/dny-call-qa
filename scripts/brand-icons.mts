// Makes the favicon and the app icons from the logo in src/lib/brand.ts (a white "d" on DNY red).
// Run after changing the logo:  npx tsx scripts/brand-icons.mts
//
//   src/app/favicon.ico            16, 32 and 48 px, for browser tabs
//   src/app/icon.svg               the same, sharp at any size
//   src/app/apple-icon.png         180 px, square: iPhones round the corners themselves
//   public/icons/icon-{192,512}.png      the installed app on Android and computers
//   public/icons/icon-maskable-512.png   full-bleed, the "d" inside the safe circle
//   src/lib/email/email-logo.ts    the logo for the top of every report email, as an inline PNG

import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { iconSvg, LOGO_INK, logoSvg, SMALL_SIZE_EXTRA_WEIGHT } from "../src/lib/brand";

const TAB = { mark: 0.68, radius: 0.2 };
const APP = { mark: 0.56, radius: 0.22 };

const png = (svg: string) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

/** An .ico holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const tabSizes = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(iconSvg(size, TAB)) })));
const files: [string, Buffer | string][] = [
  ["src/app/favicon.ico", ico(tabSizes)],
  ["src/app/icon.svg", iconSvg(32, TAB)],
  ["src/app/apple-icon.png", await png(iconSvg(180, { ...APP, radius: 0 }))],
  ["public/icons/icon-192.png", await png(iconSvg(192, APP))],
  ["public/icons/icon-512.png", await png(iconSvg(512, APP))],
  ["public/icons/icon-maskable-512.png", await png(iconSvg(512, { mark: 0.46, radius: 0 }))],
];
// Email: drawn at three times its 92 x 54 size so it stays sharp on phones, on white so it stays
// readable when a mail app switches to dark mode. Inline (not a link) so it shows without
// "display images" and doesn't depend on the site's address.
const EMAIL = { width: 92, height: 54 };
const emailPng = await sharp(Buffer.from(logoSvg(LOGO_INK.light, SMALL_SIZE_EXTRA_WEIGHT)), { density: (72 * 3 * EMAIL.width) / 99 })
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9 })
  .toBuffer();
files.push([
  "src/lib/email/email-logo.ts",
  [
    "// Made by scripts/brand-icons.mts from src/lib/brand.ts; don't edit by hand.",
    "/** The DNY Sales Agent logo at the top of every report email, sent inline with this content id. */",
    `export const EMAIL_LOGO = { cid: "dny-sales-agent-logo", width: ${EMAIL.width}, height: ${EMAIL.height}, png: "${emailPng.toString("base64")}" };`,
    "",
  ].join("\n"),
]);

for (const [path, data] of files) {
  writeFileSync(path, data);
  console.log(`${path}  ${typeof data === "string" ? data.length : data.byteLength} bytes`);
}
