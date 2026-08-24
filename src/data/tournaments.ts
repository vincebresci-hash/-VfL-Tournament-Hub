import type { AgeGroup } from "@/types/tournament";

export const ageGroupImageSrc = {
  U8: "/u8.webp",
  U9: "/u9.webp",
  U10: "/u10.webp",
  U11: "/u11.webp",
  U12: "/u12.webp",
  U13: "/u13.webp",
  U14: "/u14.webp",
} as const satisfies Record<AgeGroup, string>;
