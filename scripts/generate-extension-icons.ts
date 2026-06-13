import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const iconSizes = [16, 32, 48, 96, 128] as const;
const iconArtworkScale = 0.9;
const transparentBackground = { r: 0, g: 0, b: 0, alpha: 0 } as const;

const iconVariants = {
  alpha: {
    source: "assets/new-app-logo/ask-ai-alpha.png",
    outputDir: "apps/extension/public/icon-alpha",
  },
  dev: {
    source: "assets/new-app-logo/ask-ai-dev.png",
    outputDir: "apps/extension/public/icon-dev",
  },
  stable: {
    source: "assets/new-app-logo/ask-ai.png",
    outputDir: "apps/extension/public/icon",
  },
} as const;

export type ExtensionIconVariant = keyof typeof iconVariants;

function getRepoRoot() {
  return fileURLToPath(new URL("..", import.meta.url));
}

function isIconVariant(value: string): value is ExtensionIconVariant {
  return Object.hasOwn(iconVariants, value);
}

export async function generateExtensionIcons(variant: ExtensionIconVariant = "alpha") {
  const repoRoot = getRepoRoot();
  const { source, outputDir } = iconVariants[variant];
  const sourcePath = path.join(repoRoot, source);
  const targetDir = path.join(repoRoot, outputDir);

  await mkdir(targetDir, { recursive: true });

  const files = await Promise.all(
    iconSizes.map(async (size) => {
      const outputPath = path.join(targetDir, `${size}.png`);
      const artworkSize = Math.round(size * iconArtworkScale);
      const totalPadding = size - artworkSize;

      await sharp(sourcePath)
        .trim({ background: transparentBackground, threshold: 1 })
        .resize(artworkSize, artworkSize, {
          background: transparentBackground,
          fit: "contain",
          kernel: sharp.kernel.lanczos3,
        })
        .extend({
          top: Math.floor(totalPadding / 2),
          bottom: Math.ceil(totalPadding / 2),
          left: Math.floor(totalPadding / 2),
          right: Math.ceil(totalPadding / 2),
          background: transparentBackground,
        })
        .png({
          adaptiveFiltering: true,
          compressionLevel: 9,
          effort: 10,
        })
        .toFile(outputPath);

      return outputPath;
    }),
  );

  return { files, outputDir: targetDir, variant };
}

if (import.meta.main) {
  const variant = process.argv[2] ?? "alpha";

  if (!isIconVariant(variant)) {
    throw new Error(
      `Unknown icon variant "${variant}". Expected one of: ${Object.keys(iconVariants).join(", ")}`,
    );
  }

  const result = await generateExtensionIcons(variant);
  console.log(`Generated ${result.variant} extension icons in ${result.outputDir}`);
}
