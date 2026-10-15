import sharp from "sharp";
export async function normalizeProgressPhoto(source: Buffer) {
  const metadata = await sharp(source, {
    limitInputPixels: 40_000_000,
  }).metadata();
  if (
    !metadata.format ||
    !["jpeg", "png", "webp"].includes(metadata.format) ||
    (metadata.pages || 1) !== 1
  )
    throw new Error("Unsupported image");
  return sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
}
export function privateR2Domains(managed: unknown, custom: unknown) {
  if (
    !managed ||
    typeof managed !== "object" ||
    !("enabled" in managed) ||
    managed.enabled !== false
  )
    return false;
  if (
    !custom ||
    typeof custom !== "object" ||
    !("domains" in custom) ||
    !Array.isArray(custom.domains)
  )
    return false;
  return custom.domains.every(
    (d) => d && typeof d === "object" && d.enabled === false,
  );
}
