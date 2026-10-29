// AS-1 · the help assistant's API shapes (ESG-lite src/assistant/chat.ts, docs/assistant/README.md).

export const ASSISTANT_MAX_TURNS = 12;
export const ASSISTANT_MAX_QUESTION_CHARS = 2000;

export type AssistantRole = "User" | "Manager" | "Admin" | "Superadmin";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantChatRequest {
  messages: AssistantTurn[];
  page?: { path: string; title?: string } | null;
}

export interface AssistantSource {
  id: string;
  title: string;
  path: string | null;
}

export interface AssistantChatReply {
  reply: string;
  /** False when the help articles didn't cover the question. */
  answered: boolean;
  sources: AssistantSource[];
}

/** GET /assistant/status: the button shows only when both are true. */
export interface AssistantStatus {
  enabled: boolean;
  configured: boolean;
}

export type AssistantErrorCode = "AS_OFF" | "AS_VALIDATION" | "AS_BUDGET" | "AS_AI_UNAVAILABLE";
