// D17 · A person's KPI topics, as the company users drawer edits them
// (`PUT /kpi/people/:user_id/topics`). Pure helpers; the field is
// `KpiTopicsField`, the calls are in `usePersonTopics`.
import { KPI_TOPICS, type KpiPersonTopics, type KpiTopic, type KpiTopicMove, type PutKpiPersonTopicsBody } from "./contracts";
import { TOPIC_LABEL } from "./labels";

/** What the drawer holds: the topics, and the sites they apply to (null = all of the person's sites). */
export interface TopicsDraft {
  topics: KpiTopic[];
  siteIds: number[] | null;
}

/** The draft a person's saved topics start from: every topic they own anywhere, at all their sites. */
export function draftFromTopics(saved: KpiPersonTopics | undefined): TopicsDraft {
  return { topics: saved ? KPI_TOPICS.filter((t) => saved.topics.includes(t)) : [], siteIds: null };
}

export const toggleTopic = (d: TopicsDraft, topic: KpiTopic): TopicsDraft => ({
  ...d,
  topics: d.topics.includes(topic) ? d.topics.filter((t) => t !== topic) : KPI_TOPICS.filter((t) => t === topic || d.topics.includes(t)),
});

/** The PUT body: `site_ids` only when the person's topics are limited to some sites. */
export function topicsBody(d: TopicsDraft): PutKpiPersonTopicsBody {
  return d.siteIds === null ? { topics: d.topics } : { topics: d.topics, site_ids: [...d.siteIds].sort((a, b) => a - b) };
}

export function sameTopics(a: TopicsDraft, b: TopicsDraft): boolean {
  const sites = (x: TopicsDraft) => (x.siteIds === null ? "all" : [...x.siteIds].sort((p, q) => p - q).join(","));
  return a.topics.join(",") === b.topics.join(",") && sites(a) === sites(b);
}

/** "Water at Noida moved from Ravi Kumar to Priya Shah." per slot that changed hands; at most `max`, then "and 3 more". */
export function movedNotes(moved: KpiTopicMove[], toName: string, max = 3): string | undefined {
  if (!moved.length) return undefined;
  const line = (m: KpiTopicMove) => `${TOPIC_LABEL[m.topic] ?? m.topic} ${m.site_id === null ? "for the company" : `at ${m.site_name ?? `site ${m.site_id}`}`} moved ${m.from_name ? `from ${m.from_name} ` : ""}to ${toName}.`;
  const shown = moved.slice(0, max).map(line);
  if (moved.length > max) shown.push(`And ${moved.length - max} more.`);
  return shown.join(" ");
}
