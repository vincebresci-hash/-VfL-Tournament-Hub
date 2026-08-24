ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mein_turnierplan_url text,
  ADD COLUMN IF NOT EXISTS mein_turnierplan_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mein_turnierplan_label text,
  ADD COLUMN IF NOT EXISTS mein_turnierplan_embed_url text;

COMMENT ON COLUMN public.tournaments.mein_turnierplan_url IS
  'Externer MeinTurnierplan-Link für Live-Spieltag (nur http/https).';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_enabled IS
  'Zeigt den MeinTurnierplan-Button auf der öffentlichen Turnierseite.';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_label IS
  'Optionale Button-Beschriftung; leer = phasenabhängiger Standardtext.';
COMMENT ON COLUMN public.tournaments.mein_turnierplan_embed_url IS
  'Optionaler Embed-Link für spätere Einbindung; aktuell nicht aktiv genutzt.';
