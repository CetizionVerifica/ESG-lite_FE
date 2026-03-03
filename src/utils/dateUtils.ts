export const getYearOptions = (): number[] => {
    const startYear = 2020;
    const currentYear = new Date().getFullYear();
    const endYear = currentYear + 5;

    const years = [];
    for (let year = startYear; year <= endYear; year++) {
        years.push(year);
    }
    return years;
};
