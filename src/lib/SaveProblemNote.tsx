import { Callout } from "../ui";
import type { SaveProblem } from "./saveProblem";

/** A refused save under an edit form: a warning when the server marks it so (saveProblem), else an error. */
export function SaveProblemNote({ problem }: { problem: SaveProblem }) {
  if (problem.warning) return <Callout tone="warn" title={problem.message} />;
  return (
    <p role="alert" className="rounded-control border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {problem.message}
    </p>
  );
}
