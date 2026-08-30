import {
  CANONICAL_PRODUCTION_HOST,
  DEFAULT_PRODUCTION_SITE_URL,
  isEphemeralVercelHost,
} from "@/lib/site";

export type TournamentHubEmailTournament = {
  name?: string;
  ageGroup?: string;
  date?: string;
  time?: string;
  location?: string;
};

export type TournamentHubEmailCta = {
  label: string;
  url: string;
};

export type TournamentHubEmailOptions = {
  title: string;
  bodyText: string;
  recipientFirstName?: string;
  tournament?: TournamentHubEmailTournament;
  cta?: TournamentHubEmailCta | null;
};

const CTA_CANDIDATES: TournamentHubEmailCta[] = [
  { label: "Erhalt bestätigen", url: "" },
  { label: "Teilnahme verwalten", url: "" },
  { label: "Turnier ansehen", url: "" },
  { label: "Spielplan ansehen", url: "" },
  { label: "Live Center öffnen", url: "" },
  { label: "MeinTurnierplan öffnen", url: "" },
];

const CTA_VARIABLE_KEYS = [
  "confirmation_url",
  "participation_url",
  "tournament_url",
  "schedule_url",
  "live_url",
  "meinturnierplan_url",
] as const;

const FOOTER_TEXT = [
  "VfL Kirchheim unter Teck",
  "Tournament Hub",
  "",
  "Diese Nachricht wurde automatisch vom Tournament Hub versendet.",
].join("\n");

export function escapeHtml(value: string) {
  return value
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#39;");
}

export function isValidHttpsUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("https://")) {
    return false;
  }

  if (trimmed.startsWith("//")) {
    return false;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      isEphemeralVercelHost(hostname) ||
      hostname.includes("blim")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function resolveEmailLogoUrl() {
  return `${DEFAULT_PRODUCTION_SITE_URL}/vfl-logo-transparent.png`;
}

function assertCanonicalEmailAssetHost(url: string) {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.hostname === CANONICAL_PRODUCTION_HOST;
}

export function resolveEmailCta(
  variables: Record<string, string>,
): TournamentHubEmailCta | null {
  for (let index = 0; index < CTA_VARIABLE_KEYS.length; index += 1) {
    const key = CTA_VARIABLE_KEYS[index];
    const url = variables[key]?.trim() ?? "";
    if (!url || !isValidHttpsUrl(url)) {
      continue;
    }

    return {
      label: CTA_CANDIDATES[index]?.label ?? "Weiter",
      url,
    };
  }

  return null;
}

function resolveLogoUrl() {
  const logoUrl = resolveEmailLogoUrl();
  if (!assertCanonicalEmailAssetHost(logoUrl)) {
    return null;
  }

  return logoUrl;
}

function plainTextToHtmlParagraphs(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br />");
      return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">${lines}</p>`;
    })
    .join("");
}

function renderTournamentInfo(tournament: TournamentHubEmailTournament) {
  const rows = [
    { label: "Turnier", value: tournament.name },
    { label: "Altersklasse", value: tournament.ageGroup },
    { label: "Datum", value: tournament.date },
    { label: "Uhrzeit", value: tournament.time },
    { label: "Ort", value: tournament.location },
  ].filter((row) => row.value?.trim());

  if (rows.length === 0) {
    return "";
  }

  const items = rows
    .map((row) => {
      return `<tr>
  <td style="padding:4px 12px 4px 0;font-size:13px;line-height:1.5;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(row.label)}</td>
  <td style="padding:4px 0;font-size:13px;line-height:1.5;color:#111827;vertical-align:top;">${escapeHtml(row.value ?? "")}</td>
</tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;border-collapse:collapse;background-color:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
  <tr>
    <td style="padding:14px 16px;">
      <p style="margin:0 0 10px 0;font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">Turnierinformation</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        ${items}
      </table>
    </td>
  </tr>
</table>`;
}

function renderCtaButton(cta: TournamentHubEmailCta) {
  const url = cta.url.trim();
  if (!url || !isValidHttpsUrl(url)) {
    return "";
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px 0;border-collapse:collapse;">
  <tr>
    <td align="center" bgcolor="#0f4c2a" style="border-radius:8px;background-color:#0f4c2a;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a>
    </td>
  </tr>
</table>`;
}

export function renderTournamentHubEmailHtml(options: TournamentHubEmailOptions) {
  const title = options.title.trim() || "Tournament Hub";
  const greeting = options.recipientFirstName?.trim()
    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">Hallo ${escapeHtml(options.recipientFirstName.trim())},</p>`
    : "";
  const tournamentInfo = options.tournament
    ? renderTournamentInfo(options.tournament)
    : "";
  const bodyHtml = plainTextToHtmlParagraphs(options.bodyText);
  const cta = options.cta ?? null;
  const ctaHtml = cta ? renderCtaButton(cta) : "";
  const logoUrl = resolveLogoUrl();
  const logoHtml = logoUrl
    ? `<tr>
                    <td align="center" style="padding:0 0 10px 0;">
                      <img src="${escapeHtml(logoUrl)}" width="56" height="56" alt="VfL Kirchheim" style="display:block;border:0;outline:none;text-decoration:none;width:56px;height:56px;" />
                    </td>
                  </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef2f0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#eef2f0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 16px 0;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                  ${logoHtml}
                  <tr>
                    <td align="center" style="font-size:22px;line-height:1.2;font-weight:700;color:#0f4c2a;letter-spacing:0.02em;">VfL Kirchheim</td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:4px;font-size:12px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;color:#6b7280;font-weight:700;">Tournament Hub</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #dbe3de;border-radius:12px;padding:28px 24px;">
                <h1 style="margin:0 0 20px 0;font-size:22px;line-height:1.35;font-weight:700;color:#111827;">${escapeHtml(title)}</h1>
                ${greeting}
                ${tournamentInfo}
                ${bodyHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0 8px;text-align:center;">
                <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#4b5563;font-weight:700;">VfL Kirchheim unter Teck</p>
                <p style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#6b7280;">Tournament Hub</p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">Diese Nachricht wurde automatisch vom Tournament Hub versendet.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderTournamentHubEmailText(options: TournamentHubEmailOptions) {
  const body = String(options.bodyText ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!body) {
    return FOOTER_TEXT;
  }

  if (body.includes("VfL Kirchheim") && body.includes("Tournament Hub")) {
    return body;
  }

  return `${body}\n\n---\n${FOOTER_TEXT}`;
}

export function buildTournamentHubEmail(options: TournamentHubEmailOptions) {
  return {
    html: renderTournamentHubEmailHtml(options),
    text: renderTournamentHubEmailText(options),
  };
}

export function buildTournamentHubEmailFromTemplate(input: {
  subject: string;
  bodyText: string;
  variables: Record<string, string>;
  tournament?: TournamentHubEmailTournament;
  cta?: TournamentHubEmailCta | null;
}) {
  const recipientFirstName = input.variables.contact_first_name?.trim() || undefined;
  const tournament =
    input.tournament ??
    ({
      name: input.variables.tournament_name,
      ageGroup: input.variables.age_group,
      date: input.variables.tournament_date,
      location: input.variables.location,
    } satisfies TournamentHubEmailTournament);

  const hasTournamentInfo = Boolean(
    tournament.name?.trim() ||
      tournament.ageGroup?.trim() ||
      tournament.date?.trim() ||
      tournament.time?.trim() ||
      tournament.location?.trim(),
  );

  return buildTournamentHubEmail({
    title: input.subject,
    bodyText: String(input.bodyText ?? ""),
    recipientFirstName,
    tournament: hasTournamentInfo ? tournament : undefined,
    cta: input.cta === undefined ? resolveEmailCta(input.variables) : input.cta,
  });
}

/** @deprecated Use buildTournamentHubEmail instead. */
export function emailTextToHtml(text: string) {
  return buildTournamentHubEmail({
    title: "Tournament Hub",
    bodyText: text,
  }).html;
}
