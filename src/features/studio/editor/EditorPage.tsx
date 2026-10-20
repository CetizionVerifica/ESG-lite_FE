import { useParams } from "react-router-dom";
import { EmptyState } from "../../../ui";
import { Editor } from "./Editor";

/** `/studio/:id` (DS-6): mounts the editor for the doc in the URL. */
export function EditorPage() {
  const { id } = useParams();
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId <= 0) return <EmptyState title="This design doesn't exist." description="Open a design from Design Studio." />;
  return <Editor docId={docId} />;
}
