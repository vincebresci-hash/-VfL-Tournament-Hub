const AGE_GROUP_PNG = /\/(u8|u9|u10|u11|u12|u13|u14)\.png$/i;
const AGE_GROUP_WEBP = /\/(u8|u9|u10|u11|u12|u13|u14)\.webp$/i;

/**
 * Normalize public image paths for display.
 * Age-group assets are served as optimized WebP; legacy .png DB paths map to .webp.
 */
export function optimizePublicImageSrc(src: string) {
  if (AGE_GROUP_PNG.test(src)) {
    return src.replace(AGE_GROUP_PNG, "/$1.webp");
  }

  if (AGE_GROUP_WEBP.test(src)) {
    return src;
  }

  return src.replace(/\/anlage\.png$/i, "/anlage.webp");
}
