import { ExtraFieldDefinition } from "../pages/UserDataEntry/types";

/**
 * Returns default supplementary (extra) fields for a given category.
 * Mirrors the backend mapping in ESG-lite/src/utils/defaultExtraFields.ts
 */
export function getDefaultExtraFieldsFE(categoryId: number): ExtraFieldDefinition[] {
  const map: Record<number, ExtraFieldDefinition[]> = {
    1: [
      { key: "equipment", label: "Equipment", type: "select", required: false, options: ["Boiler", "DG Set", "Furnace", "Heater", "Kiln", "Other"] },
    ],
    3: [
      { key: "received_date", label: "Received Date", type: "date", required: false },
      { key: "po_number", label: "PO", type: "text", required: false },
      { key: "description", label: "Description of Material/Service", type: "textarea", required: false },
      { key: "quantity", label: "Quantity", type: "number", required: false },
      { key: "spent_value", label: "Spent Value", type: "number", required: false },
      { key: "currency", label: "Currency (INR/USD)", type: "select", required: false, options: ["INR", "USD", "EUR", "GBP", "BHD", "SAR", "AED"] },
      { key: "supplier_name", label: "Name of Supplier", type: "text", required: false },
    ],
    4: [
      { key: "billing_month", label: "Billing Month", type: "text", required: false },
    ],
    5: [
      { key: "equipment", label: "Equipment", type: "text", required: false },
    ],
    6: [
      { key: "period", label: "Period", type: "text", required: false },
      { key: "waste_date", label: "Date", type: "date", required: false },
      { key: "waste_category", label: "Waste Category", type: "text", required: false },
    ],
    8: [
      { key: "month", label: "Month", type: "text", required: false },
    ],
    12: [
      { key: "received_date", label: "Received Date", type: "date", required: false },
      { key: "po_number", label: "PO", type: "text", required: false },
      { key: "description", label: "Description of Material/Service", type: "textarea", required: false },
      { key: "quantity", label: "Quantity", type: "number", required: false },
      { key: "spent_value", label: "Spent Value", type: "number", required: false },
      { key: "currency", label: "Currency (INR/USD)", type: "select", required: false, options: ["INR", "USD", "EUR", "GBP", "BHD", "SAR", "AED"] },
      { key: "supplier_name", label: "Name of Supplier", type: "text", required: false },
    ],
    13: [
      { key: "transport_date", label: "Date", type: "date", required: false },
      { key: "po_number", label: "PO", type: "text", required: false },
      { key: "material_name", label: "Name of Material", type: "text", required: false },
      { key: "vehicle_type", label: "Type of Vehicle", type: "text", required: false, show_for: ["Road"] },
      { key: "quantity", label: "Quantity", type: "number", required: false },
      { key: "departure", label: "Departure", type: "text", required: false },
      { key: "destination", label: "Destination", type: "text", required: false },
    ],
    15: [
      { key: "vehicle_type", label: "Type of Vehicle", type: "text", required: false, show_for: ["Land"] },
      { key: "no_of_passengers", label: "No of Passengers", type: "number", required: false },
      { key: "boarding_point", label: "Boarding/Departure Point", type: "text", required: false },
      { key: "dropping_point", label: "Dropping/Destination Point", type: "text", required: false },
      { key: "remarks", label: "Remarks", type: "textarea", required: false },
    ],
    16: [
      { key: "vehicle_type", label: "Type of Vehicle", type: "text", required: false },
      { key: "no_of_employees", label: "No. of Employee", type: "number", required: false },
      { key: "total_vehicles", label: "Total Number of Vehicles", type: "number", required: false },
      { key: "departure", label: "Departure", type: "text", required: false },
      { key: "destination", label: "Destination", type: "text", required: false },
    ],
    18: [
      { key: "transport_date", label: "Date", type: "date", required: false },
      { key: "po_number", label: "PO", type: "text", required: false },
      { key: "material_name", label: "Name of Material", type: "text", required: false },
      { key: "vehicle_type", label: "Type of Vehicle", type: "text", required: false, show_for: ["Road"] },
      { key: "quantity", label: "Quantity", type: "number", required: false },
      { key: "departure", label: "Departure", type: "text", required: false },
      { key: "destination", label: "Destination", type: "text", required: false },
    ],
    21: [
      { key: "period", label: "Period", type: "text", required: false },
      { key: "month", label: "Month", type: "text", required: false },
    ],
    25: [
      { key: "month", label: "Month", type: "text", required: false },
    ],
    26: [
      { key: "month", label: "Month", type: "text", required: false },
    ],
  };

  return map[categoryId] || [];
}
