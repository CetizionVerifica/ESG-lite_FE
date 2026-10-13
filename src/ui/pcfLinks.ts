/** Opens the Supplier requests page with the Ask drawer pre-filled for one footprint line (C06). */
export const askSupplierLink = (studyId: number, inputId: number) => `/products/suppliers?new=1&study=${studyId}&input=${inputId}`;
