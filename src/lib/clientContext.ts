import { createContext, useContext } from "react";

/**
 * Superadmin "client context": the company that Reports and Brand themes
 * work on, picked with the client switcher in the page header (F2). Also the
 * company whose theme F1 previews. Null when no client is picked or the
 * signed-in user is not staff.
 */
export interface ClientContextValue {
  clientId: number | null;
  setClientId: (id: number | null) => void;
}

export const CLIENT_STORAGE_KEY = "esglite.clientId";

export const ClientContext = createContext<ClientContextValue>({
  clientId: null,
  setClientId: () => {},
});

export const useClientContext = () => useContext(ClientContext);

export function readStoredClientId(): number | null {
  try {
    const id = Number(localStorage.getItem(CLIENT_STORAGE_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function storeClientId(id: number | null): void {
  try {
    if (id) localStorage.setItem(CLIENT_STORAGE_KEY, String(id));
    else localStorage.removeItem(CLIENT_STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this tab only.
  }
}
