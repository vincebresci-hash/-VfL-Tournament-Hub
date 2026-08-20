export function formatDateDe(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function formatTimeDe(value: string | null | undefined) {
  const time = value?.trim();
  if (!time) {
    return null;
  }

  const match = time.match(/^(\d{2}:\d{2})/);
  return match ? `${match[1]} Uhr` : null;
}

export function formatDateTimeDe(iso: string) {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);

  if (!timePart) {
    return formatDateDe(datePart);
  }

  return `${formatDateDe(datePart)}, ${timePart} Uhr`;
}
