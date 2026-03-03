import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface MonthlyCardProps {
    month: number;
    year: number;
    entryCount: number;
    pendingCount: number;
    onView: () => void;
}

const MonthlyCard: React.FC<MonthlyCardProps> = ({ month, year, entryCount, pendingCount, onView }) => {
    const { isDark } = useTheme();
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

    const cardClass = isDark
        ? "bg-slate-800 border-slate-700 text-slate-200"
        : "bg-white border-gray-200 text-gray-800";

    return (
        <div className={`border rounded-lg shadow-sm p-4 flex flex-col justify-between h-32 hover:shadow-md transition-shadow ${cardClass}`}>
            <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold">{monthName}</h3>
                <span className="text-xs font-medium px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {year}
                </span>
            </div>

            <div className="flex justify-between items-end mt-4">
                <div className="text-sm">
                    <p className={isDark ? "text-slate-400" : "text-gray-600"}>
                        Entries: <span className="font-semibold">{entryCount}</span>
                    </p>
                    {pendingCount > 0 && (
                        <p className="text-amber-600 dark:text-amber-400 font-medium text-xs">
                            {pendingCount} Pending
                        </p>
                    )}
                </div>

                <button
                    onClick={onView}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                    View
                </button>
            </div>
        </div>
    );
};

export default MonthlyCard;
