import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const input = path.join(projectRoot, "assets", "ielts-logo-5.jpg");

const outputs = [
  { file: path.join(projectRoot, "assets", "ielts-logo-5.png"), height: 160 },
  { file: path.join(projectRoot, "assets", "ielts-logo-5@2x.png"), height: 320 },
];

for (const { file, height } of outputs) {
  await sharp(input)
    .trim({ threshold: 45 })
    .resize({ height, fit: "inside", withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
    .sharpen(1.2, 0.6, 2.8)
    .png({ compressionLevel: 9 })
    .toFile(file);

  console.log(`Wrote ${path.relative(projectRoot, file)}`);
}
