import { meinTurnierplanIframeSrc } from "@/lib/mein-turnierplan-live-render";

type MeinTurnierplanWidgetProps = {
  url: string;
  title: string;
  iframeId?: string;
  height?: number;
};

export function MeinTurnierplanWidget({
  url,
  title,
  iframeId,
  height = 727,
}: MeinTurnierplanWidgetProps) {
  const iframeSrc = meinTurnierplanIframeSrc(url);

  return (
    <div className="w-full" data-mtp-widget-state="iframe" data-mtp-widget-src={iframeSrc}>
      <iframe
        id={iframeId}
        src={iframeSrc}
        title={title}
        width="100%"
        height={height}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{
          overflow: "hidden",
          border: 0,
          width: "100%",
          minHeight: `${height}px`,
          display: "block",
        }}
      />
    </div>
  );
}
