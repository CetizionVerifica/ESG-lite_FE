import { StyleSheet } from "@react-pdf/renderer";

export function formatPeriodLabel(
  yearType: "CY" | "FY",
  year: number,
  ranges?: Record<string, { startDate: string; endDate: string }>
) {
  if (!ranges || !ranges[String(year)]) return `${yearType} ${year}`;
  const { startDate, endDate } = ranges[String(year)];
  const fmtMY = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", year: "numeric" });
  return yearType === "FY"
    ? `FY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`
    : `CY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`;
}

export function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function r2(n: number) {
  return Number((n || 0).toFixed(2));
}

export function fmt(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function fmtPct(n: number) {
  return `${(Number(n) || 0).toFixed(2)}%`;
}

export function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const EXCLUDED_CATEGORIES = ["Renewable Electricity"];

export const pdfStyles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 36, paddingHorizontal: 34, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#0f172a" },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6, color: "#0f172a" },
  h3: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 6, color: "#0f172a" },
  p: { fontSize: 10, lineHeight: 1.35, color: "#111827" },
  muted: { color: "#4b5563" },
  divider: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 10 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, marginTop: 10 },
  cardTight: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, marginTop: 8 },
  table: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, overflow: "hidden" as any },
  trHead: { flexDirection: "row", backgroundColor: "#e0f2fe" },
  tr: { flexDirection: "row" },
  th: { paddingVertical: 6, paddingHorizontal: 6, fontSize: 9, fontWeight: 700, color: "#0f172a" },
  td: { paddingVertical: 6, paddingHorizontal: 6, fontSize: 9, color: "#0f172a" },
  cellBorder: { borderRightWidth: 1, borderRightColor: "#e5e7eb" },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  right: { textAlign: "right" as any },
  fig: { marginTop: 10 },
  figCap: { marginTop: 6, fontSize: 9, color: "#111827", fontWeight: 700, textAlign: "center" as any },
  footer: {
    position: "absolute" as any,
    left: 34,
    right: 34,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between" as any,
  },
  footText: { fontSize: 9, color: "#6b7280" },
});
