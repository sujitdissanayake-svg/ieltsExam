import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");

const inputRel = process.argv[2] ?? "assets/reading clock.png";
const outputRel = process.argv[3] ?? "assets/reading clock-transparent.png";

const inputPath = path.resolve(projectRoot, inputRel);
const outputPath = path.resolve(projectRoot, outputRel);

await fs.access(inputPath);

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Key out near-white pixels (background) including anti-aliased “halo” pixels.
// Uses a distance-to-white metric and feathers alpha to avoid jagged edges.
const buffer = Buffer.from(data);
const channels = info.channels; // should be 4 after ensureAlpha

if (channels !== 4) {
  throw new Error(`Expected 4 channels (RGBA) but got ${channels}`);
}

// Tune these if needed:
// - Smaller `whiteCutoff` removes more white (stronger).
// - Larger `whiteFeather` feathers further into light gray.
const whiteCutoff = 70; // 0..765 (0 is pure white)
const whiteFeather = 220; // > cutoff; 0..765

for (let i = 0; i < buffer.length; i += 4) {
  const r = buffer[i];
  const g = buffer[i + 1];
  const b = buffer[i + 2];
  const a = buffer[i + 3];

  if (a === 0) continue;

  // Distance-to-white: small means close to white.
  const distToWhite = (255 - r) + (255 - g) + (255 - b);

  if (distToWhite <= whiteFeather) {
    const t = Math.min(1, Math.max(0, (distToWhite - whiteCutoff) / (whiteFeather - whiteCutoff)));
    const newAlpha = Math.round(a * t);
    buffer[i + 3] = newAlpha;

    // Prevent white fringing: pre-multiply color as we reduce alpha.
    if (newAlpha < a) {
      const keep = a === 0 ? 0 : newAlpha / a;
      buffer[i] = Math.round(r * keep);
      buffer[i + 1] = Math.round(g * keep);
      buffer[i + 2] = Math.round(b * keep);
    }
  }
}

await sharp(buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(outputPath);

console.log(`Wrote: ${path.relative(projectRoot, outputPath)}`);
