import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, ".."
);

const jobs = [
  {
    input: path.join(projectRoot, "assets", "british-council.jpg"),
    output: path.join(projectRoot, "assets", "british-council-trim.png"),
  },
  {
    input: path.join(projectRoot, "assets", "IDP.jpg"),
    output: path.join(projectRoot, "assets", "IDP-trim.png"),
  },
  {
    input: path.join(projectRoot, "assets", "IELTS Exam logo.png"),
    output: path.join(projectRoot, "assets", "IELTS Exam logo-trim.png"),
  },
  {
    input: path.join(projectRoot, "assets", "IELTS Exam logo 2.png"),
    output: path.join(projectRoot, "assets", "IELTS Exam logo 2-trim.png"),
  },
];

for (const { input, output } of jobs) {
  if (!existsSync(input)) {
    console.log(`Skipped missing input: ${path.relative(projectRoot, input)}`);
    continue;
  }

  // `trim(threshold)` removes borders similar to the top-left pixel.
  // Use a higher threshold so we also remove "almost white" padding.
  // Apply twice to catch small residual edges after compression artifacts.
  const threshold = 35;
  await sharp(input)
    .trim({ threshold })
    .trim({ threshold })
    .png({ compressionLevel: 9 })
    .toFile(output);
  console.log(`Wrote ${path.relative(projectRoot, output)}`);
}
