import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconClipboard(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="6" y="5" width="12" height="15" rx="2" {...stroke} />
      <path d="M9 5.5V5a3 3 0 0 1 6 0v.5" {...stroke} />
      <path d="M9 12h6M9 16h4" {...stroke} />
    </IconBase>
  );
}

export function IconMessage(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M5 16.5 4 20l3.8-1.6A8.5 8.5 0 1 0 5 16.5Z"
        {...stroke}
      />
    </IconBase>
  );
}

export function IconShield(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 3.5 19 6.2v5.6c0 4.4-3 6.9-7 8.7-4-1.8-7-4.3-7-8.7V6.2L12 3.5Z"
        {...stroke}
      />
      <path d="M9.5 12.2 11.2 14l3.4-3.8" {...stroke} />
    </IconBase>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" {...stroke} />
      <path d="M8 3.8v3.2M16 3.8v3.2M4 10h16" {...stroke} />
    </IconBase>
  );
}

export function IconPin(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10Z"
        {...stroke}
      />
      <circle cx="12" cy="11" r="1.8" {...stroke} />
    </IconBase>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8.5" r="2.4" {...stroke} />
      <path d="M4.8 18.2c.6-2.6 2.5-4 4.2-4s3.6 1.4 4.2 4" {...stroke} />
      <circle cx="16.2" cy="9.2" r="2" {...stroke} />
      <path d="M15.2 14.4c1.5.2 2.9 1.3 3.5 3.8" {...stroke} />
    </IconBase>
  );
}

export function IconTrophy(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 4h8v4.5a4 4 0 0 1-8 0V4Z" {...stroke} />
      <path d="M8 6.2H5.8A2.8 2.8 0 0 0 8 9.4M16 6.2h2.2A2.8 2.8 0 0 1 16 9.4" {...stroke} />
      <path d="M12 12.5V16M9 20h6M10.5 16h3" {...stroke} />
    </IconBase>
  );
}

export function IconStadium(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="16.5" rx="7.5" ry="3.2" {...stroke} />
      <path d="M4.5 16.5V9.8c2.4-1.6 4.8-2.4 7.5-2.4s5.1.8 7.5 2.4v6.7" {...stroke} />
      <path d="M8 10.8v6.4M16 10.8v6.4M12 7.4v12.3" {...stroke} />
    </IconBase>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5.5 12.5 9.5 16.5 18.5 7.5" {...stroke} />
    </IconBase>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" {...stroke} />
      <path d="M8 12.2 10.6 14.8 16.2 9.2" {...stroke} />
    </IconBase>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" {...stroke} />
    </IconBase>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 8h16M4 16h16" {...stroke} />
    </IconBase>
  );
}

export function IconClose(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6 6 18" {...stroke} />
    </IconBase>
  );
}

export function IconClubs(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8" cy="9" r="2.2" {...stroke} />
      <circle cx="16" cy="9" r="2.2" {...stroke} />
      <circle cx="12" cy="15.5" r="2.2" {...stroke} />
    </IconBase>
  );
}

export function IconWhistle(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="13" r="4" {...stroke} />
      <path d="M12.4 11.2 19 8.4v3.4c0 1.2-.8 2.2-2 2.4l-2.4.4" {...stroke} />
      <circle cx="9" cy="13" r="1.2" {...stroke} />
    </IconBase>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 19s-7-4.2-7-9.1A3.9 3.9 0 0 1 12 7.2 3.9 3.9 0 0 1 19 9.9C19 14.8 12 19 12 19Z"
        {...stroke}
      />
    </IconBase>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" {...stroke} />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" {...stroke} />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" {...stroke} />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" {...stroke} />
    </IconBase>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10" {...stroke} />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" {...stroke} />
    </IconBase>
  );
}

export function IconUser(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.2" {...stroke} />
      <path d="M5.5 19.2c1.2-3.2 3.5-4.7 6.5-4.7s5.3 1.5 6.5 4.7" {...stroke} />
    </IconBase>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path
        d="M19.4 13a7.7 7.7 0 0 0 .1-2l2-1.2-2-3.4-2.3.5a7.6 7.6 0 0 0-1.7-1L13.2 2h-2.4L10.5 4.9a7.6 7.6 0 0 0-1.7 1L6.5 5.4l-2 3.4 2 1.2a7.7 7.7 0 0 0 0 2l-2 1.2 2 3.4 2.3-.5a7.6 7.6 0 0 0 1.7 1L10.8 22h2.4l.3-2.9a7.6 7.6 0 0 0 1.7-1l2.3.5 2-3.4-2-1.2Z"
        {...stroke}
      />
    </IconBase>
  );
}

export function IconMail(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" {...stroke} />
      <path d="m5 8 7 5 7-5" {...stroke} />
    </IconBase>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M8.2 3.8h2.4l1.2 3-1.6 1a11 11 0 0 0 5 5l1-1.6 3 1.2v2.4A1.8 1.8 0 0 1 17.4 17 14.2 14.2 0 0 1 7 6.6a1.8 1.8 0 0 1 1.2-2.8Z"
        {...stroke}
      />
    </IconBase>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m7 10 5 5 5-5" {...stroke} />
    </IconBase>
  );
}
