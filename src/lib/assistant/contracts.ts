// AS-1 · the help assistant's API shapes (ESG-lite src/assistant/chat.ts, docs/assistant/README.md).

export const ASSISTANT_MAX_TURNS = 12;
export const ASSISTANT_MAX_QUESTION_CHARS = 2000;
export const ASSISTANT_MAX_FILE_CHARS = 15_000;
export const ASSISTANT_MAX_FILE_IMAGES = 3;
export const ASSISTANT_MAX_IMAGE_CHARS = 2_400_000;

export type AssistantRole = "User" | "Manager" | "Admin" | "Superadmin";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistantFileType = "image" | "pdf" | "spreadsheet" | "csv" | "word" | "slides" | "text" | "other";

/** A file read in the browser: its text, pictures of it, or (neither) only its name. */
export interface AssistantAttachment {
  name: string;
  type: AssistantFileType;
  text?: string;
  images?: string[];
  truncated?: boolean;
}

export interface AssistantChatRequest {
  messages: AssistantTurn[];
  page?: { path: string; title?: string } | null;
  attachment?: AssistantAttachment;
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
  /** Questions the person might ask next. */
  followups?: string[];
  /** For a thumb up or down on this answer. */
  call_id?: number;
}

/** GET /assistant/status: the bubble shows only when `enabled` and `configured` are true; `files` adds the paperclip. */
export interface AssistantStatus {
  enabled: boolean;
  configured: boolean;
  files?: boolean;
}

export type AssistantErrorCode = "AS_OFF" | "AS_FILES_OFF" | "AS_VALIDATION" | "AS_BUDGET" | "AS_AI_UNAVAILABLE";
