import type { ComponentType, SVGProps } from "react";
import {
  IconClubs,
  IconHeart,
  IconTrophy,
  IconWhistle,
} from "@/components/ui/icons";

type Stat = {
  value: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const stats: Stat[] = [
  { value: "120+", label: "Vereine", icon: IconClubs },
  { value: "28", label: "Turniere", icon: IconTrophy },
  { value: "2.500+", label: "Spieler", icon: IconWhistle },
  { value: "100%", label: "Leidenschaft", icon: IconHeart },
];

export function StatsSection() {
  return (
    <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:gap-10">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div key={stat.label}>
            <Icon className="h-5 w-5 text-brand-yellow" />
            <p className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-[2.75rem]">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] font-medium tracking-[0.08em] text-white/50 uppercase">
              {stat.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
