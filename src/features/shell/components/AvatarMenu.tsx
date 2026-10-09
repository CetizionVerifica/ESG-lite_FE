import { useNavigate } from "react-router-dom";
import { APPEARANCES, type ShellUser, initials } from "../account";
import type { Appearance } from "../standins/appearance";
import Menu, { type MenuEntry } from "../standins/Menu";
import { chromeIconButton } from "./styles";

interface AvatarMenuProps {
  user: ShellUser;
  appearance: Appearance;
  onAppearance: (a: Appearance) => void;
  onSignOut: () => void;
}

export default function AvatarMenu({ user, appearance, onAppearance, onSignOut }: AvatarMenuProps) {
  const navigate = useNavigate();
  const entries: MenuEntry[] = [
    {
      kind: "heading",
      content: (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{user.name}</div>
          <div className="truncate text-xs text-(--t-muted)">{user.email}</div>
          <div className="mt-1 text-xs text-(--t-muted)">{user.role}</div>
        </div>
      ),
    },
    { kind: "separator" },
    { kind: "heading", content: <div className="text-[11px] font-semibold uppercase tracking-wide text-(--t-muted)">Appearance</div> },
    ...APPEARANCES.map((a) => ({
      kind: "radio" as const,
      label: a.label,
      checked: appearance === a.value,
      onSelect: () => onAppearance(a.value),
    })),
    { kind: "separator" },
    { kind: "item", label: "Settings", onSelect: () => navigate("/settings") },
    { kind: "item", label: "Sign out", onSelect: onSignOut },
  ];

  return (
    <Menu
      label={
        <span className="flex size-7 items-center justify-center rounded-full bg-(--t-chrome-active) text-xs font-semibold text-(--t-chrome-fg) ring-1 ring-(--t-chrome-line)">
          {initials(user.name)}
        </span>
      }
      ariaLabel={`Account menu for ${user.name}`}
      align="end"
      showChevron={false}
      buttonClassName={chromeIconButton}
      entries={entries}
    />
  );
}
