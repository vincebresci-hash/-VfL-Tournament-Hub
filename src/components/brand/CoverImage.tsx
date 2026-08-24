"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

type CoverImageProps = {
  src?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  preload?: boolean;
  objectPosition?: string;
};

export function CoverImage({
  src,
  alt,
  className,
  imageClassName,
  sizes,
  preload = false,
  objectPosition,
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn("relative overflow-hidden bg-navy", className)}>
      {showImage ? (
        <Image
          src={src as string}
          alt={alt}
          fill
          preload={preload}
          loading={preload ? "eager" : undefined}
          sizes={sizes ?? "100vw"}
          quality={75}
          className={cn("object-cover", imageClassName)}
          style={objectPosition ? { objectPosition } : undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0"
          role={alt ? "img" : undefined}
          aria-hidden={alt ? undefined : true}
          aria-label={alt || undefined}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_35%,_#2a4d7a55,_transparent_42%),radial-gradient(ellipse_at_30%_20%,_#1a4fa028,_transparent_54%),linear-gradient(180deg,_#1a2433_0%,_#070b12_100%)]" />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, transparent 0 47.6%, rgba(255,255,255,0.16) 47.6% 52.4%, transparent 52.4%), linear-gradient(transparent 0 47.6%, rgba(255,255,255,0.1) 47.6% 52.4%, transparent 52.4%)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-navy/10" />
        </div>
      )}
    </div>
  );
}
