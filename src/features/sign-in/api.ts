import axios from "axios";
import type { MyBrand } from "../../services/brandService";
export { forgotPassword, resetPassword, verifyResetToken } from "../../services/authService";

const API_URL = import.meta.env.VITE_API_URL;

/** What a signed-out page may know about a client: name, colours, logos and look (no company id). */
export type PublicBrand = Pick<
  MyBrand,
  "name" | "primary" | "accent" | "coverFrom" | "coverTo" | "logoUrl" | "logoOnDarkUrl" | "defaultLook"
> & { slug: string };

/**
 * Client theme for `/{clientSlug}/login`, before anyone is signed in
 * (GET /brands/public/:slug, proposed in the P01 spec). Not built in ESG-lite
 * yet ("not now"; the closed ESG-lite #61 has it), so this fails and the page
 * stays PlanetPulse until it ships.
 */
export async function getPublicBrand(slug: string): Promise<PublicBrand> {
  const res = await axios.get(`${API_URL}/brands/public/${encodeURIComponent(slug)}`);
  return res.data;
}
