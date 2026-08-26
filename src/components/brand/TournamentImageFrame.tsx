import Image from "next/image";
import { CoverImage } from "@/components/brand/CoverImage";
import { cn } from "@/lib/cn";
import { media } from "@/lib/constants";

type TournamentImageFrameProps = {
  src?: string;
  alt: string;
  className?: string;
  /** Aspect ratio wrapper classes; default 16:9 */
  aspectClassName?: string;
  sizes?: string;
  preload?: boolean;
  objectPosition?: string;
  imageClassName?: string;
  /**
   * `card` = primary strength for TournamentCard.
   * `hero` = same design language, thinner accents for large detail heroes.
   */
  variant?: "card" | "hero";
};

/**
 * Wiederverwendbarer VfL-Rahmen um echte Turnier-/Bewerbungsfotos.
 * Der Rahmen ist rein dekorativ (CSS/SVG) und nicht Teil des Bild-Assets.
 * Admin tauscht nur das Originalfoto aus.
 */
export function TournamentImageFrame({
  src,
  alt,
  className,
  aspectClassName = "aspect-[16/9]",
  sizes,
  preload = false,
  objectPosition = "50% 42%",
  imageClassName,
  variant = "card",
}: TournamentImageFrameProps) {
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] bg-navy",
        isHero
          ? "shadow-[0_1px_3px_rgba(7,11,18,0.16)]"
          : "shadow-[0_2px_5px_rgba(7,11,18,0.22)]",
        className,
      )}
    >
      {/* Outer navy frame — slightly stronger on cards */}
      <div
        className={cn(
          isHero ? "p-[2px] sm:p-[3px]" : "p-[4px] sm:p-[5px]",
        )}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-[9px] bg-navy",
            aspectClassName,
          )}
        >
          {/* Inner light hairline */}
          <div
            className={cn(
              "pointer-events-none absolute z-20 rounded-[7px] border border-white/28 sm:rounded-[8px]",
              isHero
                ? "inset-[2px] sm:inset-[2px]"
                : "inset-[2px] sm:inset-[3px]",
            )}
            aria-hidden="true"
          />

          <CoverImage
            src={src}
            alt={alt}
            className="absolute inset-0 h-full w-full rounded-none"
            sizes={sizes}
            preload={preload}
            objectPosition={objectPosition}
            imageClassName={imageClassName}
          />

          {/* Soft edge vignette only — center stays natural */}
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-10",
              isHero
                ? "bg-[linear-gradient(180deg,rgba(7,11,18,0.12)_0%,transparent_22%,transparent_72%,rgba(7,11,18,0.18)_100%),linear-gradient(90deg,rgba(7,11,18,0.1)_0%,transparent_14%,transparent_86%,rgba(7,11,18,0.1)_100%)]"
                : "bg-[linear-gradient(180deg,rgba(7,11,18,0.14)_0%,transparent_24%,transparent_68%,rgba(7,11,18,0.22)_100%),linear-gradient(90deg,rgba(7,11,18,0.12)_0%,transparent_16%,transparent_84%,rgba(7,11,18,0.12)_100%)]",
            )}
            aria-hidden="true"
          />

          {/* Decorative geometry: diagonals + yellow accents */}
          <svg
            className={cn(
              "pointer-events-none absolute inset-0 z-20 h-full w-full",
              isHero && "opacity-80",
            )}
            viewBox="0 0 320 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
            preserveAspectRatio="none"
          >
            {/* Blue diagonal stripes — top-right */}
            <path
              d="M236 0 320 0 320 44Z"
              fill="#0B4AA0"
              fillOpacity={isHero ? "0.18" : "0.28"}
            />
            <path
              d="M252 0 320 0 320 28Z"
              fill="#0B4AA0"
              fillOpacity={isHero ? "0.14" : "0.22"}
            />
            <path
              d="M210 0 320 0 320 62"
              stroke="#0B4AA0"
              strokeOpacity={isHero ? "0.32" : "0.45"}
              strokeWidth={isHero ? "1" : "1.2"}
            />
            <path
              d="M268 0 320 0 320 22"
              stroke="#FFCC00"
              strokeOpacity={isHero ? "0.55" : "0.7"}
              strokeWidth={isHero ? "1.1" : "1.4"}
            />

            {/* Blue diagonal stripes — bottom-left */}
            <path
              d="M0 136 0 180 84 180Z"
              fill="#0B4AA0"
              fillOpacity={isHero ? "0.16" : "0.26"}
            />
            <path
              d="M0 152 0 180 52 180Z"
              fill="#0B4AA0"
              fillOpacity={isHero ? "0.12" : "0.2"}
            />
            <path
              d="M0 118 0 180 110 180"
              stroke="#0B4AA0"
              strokeOpacity={isHero ? "0.28" : "0.4"}
              strokeWidth={isHero ? "1" : "1.2"}
            />
            <path
              d="M0 158 0 180 38 180"
              stroke="#FFCC00"
              strokeOpacity={isHero ? "0.5" : "0.65"}
              strokeWidth={isHero ? "1.1" : "1.4"}
            />

            {/* Yellow corner ticks */}
            <path
              d="M14 28V14H28"
              stroke="#FFCC00"
              strokeWidth={isHero ? "1.3" : "1.6"}
            />
            <path
              d="M292 14H306V28"
              stroke="#FFCC00"
              strokeWidth={isHero ? "1.3" : "1.6"}
            />
            <path
              d="M306 152V166H292"
              stroke="#FFCC00"
              strokeWidth={isHero ? "1.3" : "1.6"}
            />
            <path
              d="M28 166H14V152"
              stroke="#FFCC00"
              strokeWidth={isHero ? "1.3" : "1.6"}
            />
          </svg>

          {/* Crest badge — ~20% larger than initial frame, still proportional on mobile */}
          <div
            className={cn(
              "pointer-events-none absolute z-30 flex items-center justify-center rounded-full bg-navy/55 ring-1 ring-white/25 backdrop-blur-[2px]",
              isHero
                ? "top-2 left-2 h-8 w-8 sm:top-2.5 sm:left-2.5 sm:h-9 sm:w-9 lg:h-10 lg:w-10"
                : "top-2 left-2 h-10 w-10 sm:top-2.5 sm:left-2.5 sm:h-11 sm:w-11 lg:h-12 lg:w-12",
            )}
            aria-hidden="true"
          >
            <Image
              src={media.logo}
              alt=""
              width={72}
              height={72}
              unoptimized
              className="h-[72%] w-[72%] object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
