import { type ReactNode, useCallback, useMemo, useState } from "react";
import { ClientContext, readStoredClientId, storeClientId } from "./clientContext";

export default function ClientContextProvider({ children }: { children: ReactNode }) {
  const [clientId, setState] = useState<number | null>(readStoredClientId);
  const setClientId = useCallback((id: number | null) => {
    storeClientId(id);
    setState(id);
  }, []);
  const value = useMemo(() => ({ clientId, setClientId }), [clientId, setClientId]);
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}
