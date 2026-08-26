import type { AgeGroup } from "@/types/tournament";

/** Canonical age-group originals in /public (real VfL tournament photos). */
export const ageGroupImageSrc = {
  U8: "/u8.png",
  U9: "/u9.png",
  U10: "/u10.png",
  U11: "/u11.png",
  U12: "/u12.png",
  U13: "/u13.png",
  U14: "/u14.png",
} as const satisfies Record<AgeGroup, string>;
