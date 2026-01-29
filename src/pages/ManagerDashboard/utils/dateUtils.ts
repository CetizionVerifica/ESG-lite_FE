import { DropdownOption } from "../../../components/Dropdown";

const START_YEAR = 2018;
const END_YEAR = 2030;

export function generateDateOptions(): DropdownOption[] {
  const options: DropdownOption[] = [];

  for (let year = END_YEAR; year >= START_YEAR; year--) {
    for (let month = 11; month >= 0; month--) {
      const date = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0).getDate();
      const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      options.push({ id: value, label });
    }
  }

  return options;
}

export function generateYearOptions(): DropdownOption[] {
  const options: DropdownOption[] = [];

  for (let year = END_YEAR; year >= START_YEAR; year--) {
    options.push({ id: year, label: String(year) });
  }

  return options;
}

export function getMonthLabels(): string[] {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
}

export function formatDateForDisplay(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

export function getYearFromDate(dateString: string): number {
  return new Date(dateString).getFullYear();
}

export function getMonthFromDate(dateString: string): number {
  return new Date(dateString).getMonth();
}

export function getYearMonthKey(dateString: string): string {
  return dateString.substring(0, 7);
}
