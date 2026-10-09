import { Menu as MenuIcon, Search } from "lucide-react";
import type { ShellUser } from "../account";
import type { Look, ShellBrand } from "../brand";
import type { NavItem } from "../nav";
import type { Appearance } from "../../../theme";
import AvatarMenu from "./AvatarMenu";
import BellPopover from "./BellPopover";
import DesktopNav from "./DesktopNav";
import LogoSlot from "./LogoSlot";
import { chromeIconButton } from "./styles";

interface TopBarProps {
  brand: ShellBrand;
  look: Look;
  home: string;
  nav: NavItem[];
  clientId: number | null;
  user: ShellUser;
  appearance: Appearance;
  onAppearance: (a: Appearance) => void;
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onSignOut: () => void;
  drawerOpen: boolean;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** 52px top bar on --t-chrome. Below 1024px: logo, hamburger and bell only. */
export default function TopBar(props: TopBarProps) {
  const { brand, look, home, nav, clientId, user, appearance, onAppearance, onOpenDrawer, onOpenSearch, onSignOut, drawerOpen } = props;
  return (
    <header className="sticky top-0 z-40 h-13 border-b border-(--t-chrome-line) bg-(--t-chrome) text-(--t-chrome-fg)">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-2 px-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className={`${chromeIconButton} lg:hidden`}
        >
          <MenuIcon size={20} aria-hidden />
        </button>
        <LogoSlot brand={brand} look={look} home={home} />
        <span aria-hidden className="mx-2 hidden h-5 w-px bg-(--t-chrome-line) lg:block" />
        <DesktopNav items={nav} clientId={clientId} />

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search pages"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            className="hidden h-9 items-center gap-2 rounded-(--r-md) border border-(--t-chrome-line) px-2.5 text-sm text-(--t-chrome-muted) outline-none hover:text-(--t-chrome-fg) focus-visible:ring-2 focus-visible:ring-(--t-chrome-fg) lg:inline-flex"
          >
            <Search size={15} aria-hidden />
            <span className="hidden xl:inline">Search</span>
            <kbd className="hidden rounded-(--r-sm) border border-(--t-chrome-line) px-1 font-sans text-[11px] xl:inline">{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <BellPopover />
          <div className="hidden lg:block">
            <AvatarMenu user={user} appearance={appearance} onAppearance={onAppearance} onSignOut={onSignOut} />
          </div>
        </div>
      </div>
    </header>
  );
}
