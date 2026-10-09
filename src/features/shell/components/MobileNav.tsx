import { NavLink, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { APPEARANCES, type ShellUser } from "../account";
import { type NavItem, isActiveLink, resolveNavTo } from "../nav";
import type { Appearance } from "../standins/appearance";
import Drawer from "../standins/Drawer";
import { focusRing } from "./styles";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  clientId: number | null;
  user: ShellUser;
  appearance: Appearance;
  onAppearance: (a: Appearance) => void;
  onSearch: () => void;
  onSignOut: () => void;
}

/** < 1024px: the whole nav, with labels and groups spelled out, in a left drawer. */
export default function MobileNav({ open, onClose, items, clientId, user, appearance, onAppearance, onSearch, onSignOut }: MobileNavProps) {
  const { pathname, search } = useLocation();

  const renderLink = (label: string, rawTo: string, indent: boolean) => {
    const to = resolveNavTo(rawTo, clientId);
    const active = isActiveLink(to, pathname, search);
    return (
      <NavLink
        key={`${label}-${rawTo}`}
        to={to}
        onClick={onClose}
        aria-current={active ? "page" : undefined}
        className={`mx-2 flex items-center rounded-(--r-md) py-2 text-sm ${indent ? "pl-6 pr-3" : "px-3"} ${
          active ? "bg-(--t-tint) font-semibold text-(--t-brand-text)" : "hover:bg-(--t-tint)"
        } ${focusRing}`}
      >
        {label}
      </NavLink>
    );
  };

  return (
    <Drawer open={open} onClose={onClose} title="Menu">
      <nav aria-label="Main" className="py-2">
        {items.map((item) =>
          item.kind === "link" ? (
            renderLink(item.label, item.to, false)
          ) : (
            <div key={item.label} role="group" aria-label={item.label} className="mt-2">
              <div className="px-5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-(--t-muted)">{item.label}</div>
              {item.items.map((child) => renderLink(child.label, child.to, true))}
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-(--t-line) py-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            onSearch();
          }}
          className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-(--r-md) px-3 py-2 text-sm hover:bg-(--t-tint) ${focusRing}`}
        >
          <Search size={16} aria-hidden /> Search
        </button>
        {renderLink("Notifications", "/notifications", false)}
        {renderLink("Settings", "/settings", false)}
      </div>

      <div className="border-t border-(--t-line) px-5 py-3">
        <div className="truncate text-sm font-semibold">{user.name}</div>
        <div className="truncate text-xs text-(--t-muted)">
          {user.email}
          {user.role && ` · ${user.role}`}
        </div>
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-(--t-muted)" id="drawer-appearance">
          Appearance
        </div>
        <div role="radiogroup" aria-labelledby="drawer-appearance" className="mt-1.5 grid grid-cols-3 gap-1 rounded-(--r-md) bg-(--t-tint) p-1">
          {APPEARANCES.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={appearance === a.value}
              onClick={() => onAppearance(a.value)}
              className={`rounded-(--r-sm) py-1.5 text-xs font-medium ${appearance === a.value ? "bg-(--t-panel) shadow-sm" : "text-(--t-muted)"} ${focusRing}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className={`mt-3 w-full rounded-(--r-md) border border-(--t-line) py-2 text-sm font-medium hover:bg-(--t-tint) ${focusRing}`}
        >
          Sign out
        </button>
      </div>
    </Drawer>
  );
}
