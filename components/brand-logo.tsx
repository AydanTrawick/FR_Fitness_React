import Image from "next/image";

/** Ink.primary artwork extracted from the supplied Rep One reference. */
export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      className="rep-one-logo"
      src="/brand/rep-one-ink.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      unoptimized
    />
  );
}
