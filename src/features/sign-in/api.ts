import axios from "axios";
import type { MyBrand } from "../../services/brandService";
export { forgotPassword, resetPassword, verifyResetToken } from "../../services/authService";

const API_URL = import.meta.env.VITE_API_URL;

/** What a signed-out page may know about a client: name, colours and logos. */
export type PublicBrand = Pick<
  MyBrand,
  "companyId" | "name" | "primary" | "accent" | "coverFrom" | "coverTo" | "logoUrl" | "logoOnDarkUrl" | "defaultLook"
>;

/**
 * Client theme for `/{clientSlug}/login`, before anyone is signed in.
 * GET /brands/public/:slug is proposed in the P01 spec and not built in
 * ESG-lite yet; until it is, this rejects and the page stays PlanetPulse.
 */
export async function getPublicBrand(slug: string): Promise<PublicBrand> {
  const res = await axios.get(`${API_URL}/brands/public/${encodeURIComponent(slug)}`);
  return res.data;
}
