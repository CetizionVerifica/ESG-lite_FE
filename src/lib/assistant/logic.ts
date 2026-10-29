// AS-1 · the help assistant's pure logic: the request from the thread, the
// answer's small Markdown (paragraphs, lists, bold, code, links to app paths
// only), error copy, starter questions per role and the thread kept for the tab.
import { ASSISTANT_MAX_QUESTION_CHARS, ASSISTANT_MAX_TURNS, type AssistantChatRequest, type AssistantRole, type AssistantSource, type AssistantStatus, type AssistantTurn } from "./contracts";

export interface ThreadTurn extends AssistantTurn {
  sources?: AssistantSource[];
  answered?: boolean;
}

export const assistantVisible = (status: AssistantStatus | undefined): boolean => status?.enabled === true && status?.configured === true;

/** The last turns that fit, then the new question. Earlier answers are cut to what the server takes. */
export function requestFor(thread: ThreadTurn[], question: string, page: { path: string; title?: string } | null): AssistantChatRequest {
  const earlier = thread.slice(-(ASSISTANT_MAX_TURNS - 1)).map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  // The server wants the last turn to be the person's and the first to make sense on its own.
  while (earlier.length && earlier[0].role === "assistant") earlier.shift();
  return { messages: [...earlier, { role: "user", content: question.trim().slice(0, ASSISTANT_MAX_QUESTION_CHARS) }], page };
}

export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "code"; v: string } | { t: "link"; label: string; to: string };
export type Block = { type: "p"; inlines: Inline[] } | { type: "ol" | "ul"; items: Inline[][] };

/** An app path: "/data/new", never "//host" or "https:". */
export const isAppPath = (to: string): boolean => /^\/(?!\/)[A-Za-z0-9\-._~/?=&#%]*$/.test(to);

export function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else if (isAppPath(m[4])) out.push({ t: "link", label: m[3], to: m[4] });
    else out.push({ t: "text", v: m[3] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

/** Blank-line paragraphs; "1." / "-" / "*" lines make lists. Anything else is text, never HTML. */
export function markdownBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { type: "ol" | "ul"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", inlines: inlines(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.type, items: list.items.map(inlines) });
    list = null;
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    if (ol || ul) {
      flushPara();
      const type = ol ? "ol" : "ul";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((ol ?? ul)![1]);
    } else if (!line) {
      flushPara();
      flushList();
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      flushList();
      para.push(line.replace(/^#{1,6}\s+/, ""));
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** What a failed question says, from the server's code. */
export function errorCopy(error: unknown): string {
  const data = (error as { response?: { data?: { code?: unknown; details?: { limit?: unknown } } } })?.response?.data;
  switch (data?.code) {
    case "AS_OFF":
      return "The help assistant isn't turned on for your company.";
    case "AS_BUDGET":
      return data.details?.limit === "company_month_usd"
        ? "The help assistant has reached this month's limit for your company. Ask your Admin, or try again next month."
        : "You've asked a lot of questions today. The help assistant can answer again tomorrow.";
    case "AS_VALIDATION":
      return `That question is too long. Keep it under ${ASSISTANT_MAX_QUESTION_CHARS.toLocaleString("en")} characters.`;
    case "AS_AI_UNAVAILABLE":
      return "The help assistant can't answer right now. Try again in a moment.";
    default:
      return "Something went wrong. Try again.";
  }
}

const STARTERS: Record<AssistantRole, string[]> = {
  User: ["How do I add this month's data?", "What does Pending mean?", "How do I fix a rejected entry?"],
  Manager: ["How do I approve entries?", "How do I see what's missing this month?", "How do I reject an entry with a reason?"],
  Admin: ["How do I add a user?", "How do I give someone more sites?", "What can each role do?"],
  Superadmin: ["How do I set up a form?", "How do I turn on a feature for a client?", "How do I give a user more sites?"],
};

export const starterQuestions = (role: string | null | undefined): string[] => STARTERS[(role as AssistantRole) in STARTERS ? (role as AssistantRole) : "User"];

const storageKey = (userId: unknown) => `esglite.assistant.thread.${String(userId ?? "anon")}`;

/** The thread for this tab and person (sessionStorage); empty when storage is blocked or the data is bad. */
export function loadThread(userId: unknown): ThreadTurn[] {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string").slice(-ASSISTANT_MAX_TURNS * 2) : [];
  } catch {
    return [];
  }
}

export function saveThread(userId: unknown, thread: ThreadTurn[]): void {
  try {
    if (thread.length) sessionStorage.setItem(storageKey(userId), JSON.stringify(thread.slice(-ASSISTANT_MAX_TURNS * 2)));
    else sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Storage blocked: the thread lives only while the panel is mounted.
  }
}
