import { Button, Callout } from "../ui";
import type { SaveProblem } from "./saveProblem";

/**
 * A refused save under an edit form: a warning when the server marks it so (saveProblem), else an error.
 * A duplicate offers Keep both when the form can send the edit again as a separate entry.
 */
export function SaveProblemNote({ problem, onKeepBoth }: { problem: SaveProblem; onKeepBoth?: () => void }) {
  if (problem.warning) {
    const action =
      problem.duplicate && onKeepBoth ? (
        <Button size="sm" onClick={onKeepBoth}>
          Keep both
        </Button>
      ) : undefined;
    return <Callout tone="warn" title={problem.message} action={action} />;
  }
  return (
    <p role="alert" className="rounded-control border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {problem.message}
    </p>
  );
}
