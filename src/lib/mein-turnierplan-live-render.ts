import {
  MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
  type MeinTurnierplanFields,
  validateMeinTurnierplanWidgetUrl,
} from "@/lib/mein-turnierplan";

export type MeinTurnierplanWidgetView = "iframe" | "missing-url";

export type MeinTurnierplanLiveTabRenderInput = {
  showLiveTab: boolean;
  tab?: string;
  liveSection?: string;
  tournament: MeinTurnierplanFields;
};

export type MeinTurnierplanLiveTabRenderPlan = {
  renderLiveSection: boolean;
  liveView: "spielplan" | "tabelle";
  matchesWidgetUrl: string | null;
  tableWidgetUrl: string | null;
  widgetView: MeinTurnierplanWidgetView;
};

export function resolvePublicMatchesWidgetUrl(tournament: MeinTurnierplanFields) {
  const direct = tournament.meinTurnierplanMatchesWidgetUrl?.trim();
  if (direct) {
    return validateMeinTurnierplanWidgetUrl(direct, "matches").url;
  }

  const embed = tournament.meinTurnierplanEmbedUrl?.trim();
  if (!embed || embed.includes("<")) {
    return null;
  }

  return validateMeinTurnierplanWidgetUrl(embed, "matches").url;
}

export function resolvePublicTableWidgetUrl(tournament: MeinTurnierplanFields) {
  const direct = tournament.meinTurnierplanTableWidgetUrl?.trim();
  if (direct) {
    return validateMeinTurnierplanWidgetUrl(direct, "table").url;
  }

  const embed = tournament.meinTurnierplanEmbedUrl?.trim();
  if (!embed || embed.includes("<")) {
    return null;
  }

  return validateMeinTurnierplanWidgetUrl(embed, "table").url;
}

export function meinTurnierplanWidgetView(input: {
  widgetUrl: string | null | undefined;
}): MeinTurnierplanWidgetView {
  const url = input.widgetUrl?.trim() ?? "";
  if (!url) {
    return "missing-url";
  }

  return "iframe";
}

export function planMeinTurnierplanLiveTabRender(
  input: MeinTurnierplanLiveTabRenderInput,
): MeinTurnierplanLiveTabRenderPlan {
  const liveView = input.liveSection === "tabelle" ? "tabelle" : "spielplan";
  const matchesWidgetUrl = resolvePublicMatchesWidgetUrl(input.tournament);
  const tableWidgetUrl = resolvePublicTableWidgetUrl(input.tournament);
  const activeWidgetUrl = liveView === "spielplan" ? matchesWidgetUrl : tableWidgetUrl;

  return {
    renderLiveSection: input.showLiveTab && input.tab === "live",
    liveView,
    matchesWidgetUrl,
    tableWidgetUrl,
    widgetView: meinTurnierplanWidgetView({
      widgetUrl: activeWidgetUrl,
    }),
  };
}

export function meinTurnierplanIframeSrc(widgetUrl: string) {
  return widgetUrl.trim();
}

/** @deprecated Use meinTurnierplanIframeSrc */
export function meinTurnierplanIframeSrcAfterLoad(widgetUrl: string) {
  return meinTurnierplanIframeSrc(widgetUrl);
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runMeinTurnierplanLiveRenderSelfChecks() {
  const tournament: MeinTurnierplanFields = {
    meinTurnierplanEnabled: true,
    meinTurnierplanUrl: null,
    meinTurnierplanMatchesWidgetUrl: MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
  };

  const liveTab = planMeinTurnierplanLiveTabRender({
    showLiveTab: true,
    tab: "live",
    tournament,
  });
  assert(liveTab.renderLiveSection, "live tab aktiv muss Live-Section rendern");
  assert(
    liveTab.matchesWidgetUrl === MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
    "widget URL muss gesetzt sein",
  );
  assert(liveTab.widgetView === "iframe", "gültige Widget-URL muss direkt iframe rendern");

  const iframeSrc = meinTurnierplanIframeSrc(MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL);
  assert(iframeSrc.includes("id=2jrb0hvxvd"), "iframe src muss Widget-ID enthalten");
  assert(iframeSrc.includes("s[size]=9"), "iframe src muss s[size]=9 enthalten");
  assert(iframeSrc.includes("s[maincolor]=173f75"), "iframe src muss s[maincolor]=173f75 enthalten");
  assert(
    iframeSrc === MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
    "iframe src darf URL nicht verändern",
  );

  const hiddenLiveTab = planMeinTurnierplanLiveTabRender({
    showLiveTab: true,
    tab: "spielplan",
    tournament,
  });
  assert(!hiddenLiveTab.renderLiveSection, "andere Tabs dürfen Live-Section nicht rendern");

  const widgetOnly = planMeinTurnierplanLiveTabRender({
    showLiveTab: true,
    tab: "live",
    tournament: {
      meinTurnierplanEnabled: true,
      meinTurnierplanUrl: null,
      meinTurnierplanMatchesWidgetUrl: MEIN_TURNIERPLAN_REAL_MATCHES_WIDGET_URL,
      meinTurnierplanTableWidgetUrl: null,
    },
  });
  assert(widgetOnly.widgetView === "iframe", "widget-only muss direkt iframe rendern");
  assert(widgetOnly.tableWidgetUrl === null, "leere Tabellen-URL darf keinen Fehler erzeugen");

  const hybridWithoutUrls = planMeinTurnierplanLiveTabRender({
    showLiveTab: true,
    tab: "live",
    tournament: {
      meinTurnierplanEnabled: true,
      meinTurnierplanUrl: null,
    },
  });
  assert(hybridWithoutUrls.renderLiveSection, "live tab ohne URL muss trotzdem Section rendern");
  assert(hybridWithoutUrls.widgetView === "missing-url", "fehlende URL muss erkennbar sein");

  return "ok";
}
