import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { withoutParams } from "../../../ui";

const OPEN = "open";

/** The drawer lives in the URL (`?open=new` or `?open=<id>`) so a record can be linked to. */
export function useOpenParam(): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null) =>
      setParams(
        (p) => {
          const next = withoutParams(p, [OPEN]);
          if (value) next.set(OPEN, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [params.get(OPEN), set];
}
