import { Link } from "react-router-dom";
import { type Look, type ShellBrand, pickLogo } from "../brand";

export default function LogoSlot({ brand, look, home }: { brand: ShellBrand; look: Look; home: string }) {
  const logo = pickLogo(brand, look);
  return (
    <Link
      to={home}
      aria-label={`${brand.name} home`}
      className="flex h-9 shrink-0 items-center rounded-(--r-md) px-1 outline-none focus-visible:ring-2 focus-visible:ring-(--t-chrome-fg)"
    >
      {logo.kind === "image" ? (
        <img src={logo.src} alt={logo.alt} className="h-7 max-w-40 object-contain" />
      ) : (
        <span className="max-w-48 truncate text-[15px] font-semibold tracking-tight text-(--t-chrome-fg)">{logo.name}</span>
      )}
    </Link>
  );
}
