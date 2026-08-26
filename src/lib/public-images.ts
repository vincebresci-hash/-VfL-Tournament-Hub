const AGE_GROUP_WEBP = /\/(u8|u9|u10|u11|u12|u13|u14)\.webp$/i;
const AGE_GROUP_PNG = /\/(u8|u9|u10|u11|u12|u13|u14)\.png$/i;

/**
 * Normalize public image paths for display.
 * Age-group defaults use canonical PNG originals; legacy .webp defaults map to .png.
 */
export function optimizePublicImageSrc(src: string) {
  if (AGE_GROUP_WEBP.test(src)) {
    return src.replace(AGE_GROUP_WEBP, "/$1.png");
  }

  if (AGE_GROUP_PNG.test(src)) {
    return src;
  }

  return src.replace(/\/anlage\.png$/i, "/anlage.webp");
}
