import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Menu } from "../../../ui";
import { type NavItem, isActiveLink, isGroupActive, resolveNavTo } from "../nav";
import { chromeItem } from "./styles";

/** Top-bar nav for ≥ 1024px. Groups open on click or keyboard, never on hover. */
export default function DesktopNav({ items, clientId }: { items: NavItem[]; clientId: number | null }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  return (
    <nav aria-label="Main" className="hidden min-w-0 items-center gap-0.5 lg:flex">
      {items.map((item) => {
        if (item.kind === "link") {
          const to = resolveNavTo(item.to, clientId);
          const active = isActiveLink(to, pathname, search);
          return (
            <NavLink key={item.label} to={to} aria-current={active ? "page" : undefined} className={chromeItem(active)}>
              {item.label}
            </NavLink>
          );
        }
        const active = isGroupActive(item, pathname, search);
        return (
          <Menu
            key={item.label}
            align="start"
            items={item.items.map((child) => {
              const to = resolveNavTo(child.to, clientId);
              return { label: child.label, current: isActiveLink(to, pathname, search), onSelect: () => navigate(to) };
            })}
            trigger={(props) => (
              <button {...props} type="button" data-current={active || undefined} className={chromeItem(active)}>
                {item.label}
                <ChevronDown size={14} aria-hidden className={`transition-transform ${props["aria-expanded"] ? "rotate-180" : ""}`} />
              </button>
            )}
          />
        );
      })}
    </nav>
  );
}
