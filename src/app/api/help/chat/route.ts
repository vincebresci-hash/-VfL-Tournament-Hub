import { NextResponse } from "next/server";
import { processHelpChatMessage } from "@/lib/help/help-chat";
import { sanitizeHelpChatInput } from "@/lib/help/help-chat-input";
import {
  HELP_CHAT_RATE_LIMIT_MESSAGE,
  isHelpChatRateLimited,
  recordHelpChatAttempt,
  resolveHelpChatRateLimitIdentifier,
} from "@/lib/help/help-chat-rate-limit";
import { publicContactEmail } from "@/lib/contact";
import { getAppSettings } from "@/lib/settings";

export async function POST(request: Request) {
  const identifier = resolveHelpChatRateLimitIdentifier(request);

  if (identifier && isHelpChatRateLimited(identifier)) {
    return NextResponse.json(
      { error: HELP_CHAT_RATE_LIMIT_MESSAGE },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const message =
    body && typeof body === "object" && "message" in body
      ? sanitizeHelpChatInput((body as { message: unknown }).message)
      : null;

  if (!message) {
    return NextResponse.json(
      { error: "Bitte eine gültige Frage eingeben (max. 500 Zeichen)." },
      { status: 400 },
    );
  }

  if (identifier) {
    recordHelpChatAttempt(identifier);
  }

  const settings = await getAppSettings();
  const contactEmail = publicContactEmail(settings);
  const result = processHelpChatMessage(message, contactEmail);

  return NextResponse.json(result);
}
