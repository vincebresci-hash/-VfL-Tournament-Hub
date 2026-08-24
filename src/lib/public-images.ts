const AGE_GROUP_FILE = /\/(u8|u9|u10|u11|u12|u13|u14)\.png$/i;

export function optimizePublicImageSrc(src: string) {
  return src
    .replace(AGE_GROUP_FILE, "/$1.webp")
    .replace(/\/anlage\.png$/i, "/anlage.webp");
}
