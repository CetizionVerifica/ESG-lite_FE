import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { type NavItem, isActiveLink, isGroupActive, resolveNavTo } from "../nav";
import Menu from "../standins/Menu";
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
            label={item.label}
            current={active}
            buttonClassName={chromeItem(active)}
            entries={item.items.map((child) => {
              const to = resolveNavTo(child.to, clientId);
              return { kind: "item" as const, label: child.label, current: isActiveLink(to, pathname, search), onSelect: () => navigate(to) };
            })}
          />
        );
      })}
    </nav>
  );
}
