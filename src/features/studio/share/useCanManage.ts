// DS-11 · Managers and the Superadmin make finals and view links (D5, 01-contracts §4 "M").
import { useAuth } from "../../../context/AuthContext";

export function useCanManage(): boolean {
  const { role } = useAuth();
  return role === "Manager" || role === "Superadmin";
}
