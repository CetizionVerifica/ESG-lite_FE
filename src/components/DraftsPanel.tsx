import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getEntries, updateEntry } from '../services/allDataEntryService';
import { getYearOptions } from '../utils/dateUtils';
import toast from 'react-hot-toast';

interface DraftsPanelProps {
    siteId: number | null;
    refreshTrigger: number;
    onEntrySubmit: () => void;
    categoryId?: number | null;
    subcategoryId?: number | null;
}

const DraftsPanel: React.FC<DraftsPanelProps> = ({ siteId, refreshTrigger, onEntrySubmit, categoryId, subcategoryId }) => {
    const { user } = useAuth();
    const { isDark } = useTheme();
    const [drafts, setDrafts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Filters
    const [filterMonth, setFilterMonth] = useState<string>('');
    const [filterYear, setFilterYear] = useState<string>('');

    const fetchDrafts = async () => {
        if (!siteId) return;
        setLoading(true);
        try {
            const data = await getEntries({
                site_id: siteId,
                status: 'Draft', // Fetch ONLY Drafts
                month: filterMonth ? parseInt(filterMonth) : undefined,
                year: filterYear ? parseInt(filterYear) : undefined,
                category_id: categoryId !== undefined ? (categoryId || undefined) : undefined,
                subcategory_id: subcategoryId !== undefined ? (subcategoryId || undefined) : undefined,
            });
            setDrafts(data);
            setSelectedIds([]); // Clear selection on refresh
        } catch (error) {
            console.error("Failed to fetch drafts", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrafts();
    }, [siteId, refreshTrigger, filterMonth, filterYear, categoryId, subcategoryId]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(drafts.map(d => d.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBulkSubmit = async () => {
        if (selectedIds.length === 0) return;
        try {
            await Promise.all(selectedIds.map(id => updateEntry(id, { status: 'Ready for Review' })));
            toast.success("Drafts submitted successfully!");
            setSelectedIds([]);
            fetchDrafts();
            onEntrySubmit(); // Refresh main list
        } catch (error) {
            console.error("Failed to submit drafts", error);
            toast.error("Failed to submit some drafts.");
        }
    };

    const panelClass = isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-gray-200 text-gray-900";
    const itemClass = isDark ? "hover:bg-slate-700/50 border-slate-700" : "hover:bg-gray-50 border-gray-100";

    if (!siteId || (user?.role !== 'User')) return null; // Only for Users (or make visible to manager if needed?)

    return (
        <div className={`rounded-xl border shadow-sm overflow-hidden flex flex-col h-full ${panelClass}`}>
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
                <h3 className="font-semibold text-lg mb-4">Drafts</h3>

                {/* Filters */}
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <select
                            value={filterMonth}
                            onChange={(e) => setFilterMonth(e.target.value)}
                            className={`flex-1 text-xs rounded px-2 py-1.5 border outline-none ${isDark ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-300"}`}
                        >
                            <option value="">Month</option>
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
                            ))}
                        </select>
                        <select
                            value={filterYear}
                            onChange={(e) => setFilterYear(e.target.value)}
                            className={`flex-1 text-xs rounded px-2 py-1.5 border outline-none ${isDark ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-300"}`}
                        >
                            <option value="">Year</option>
                            {getYearOptions().map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Bulk Action */}
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={drafts.length > 0 && selectedIds.length === drafts.length}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">Select All</span>
                    </div>
                    <button
                        onClick={handleBulkSubmit}
                        disabled={selectedIds.length === 0}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${selectedIds.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'}`}
                    >
                        Submit for Review ({selectedIds.length})
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="text-center py-8 text-sm text-gray-500">Loading...</div>
                ) : drafts.length === 0 ? (
                    <div className="text-center py-8 text-sm text-gray-500">No drafts found.</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {drafts.map(draft => (
                            <div key={draft.id} className={`p-3 rounded border flex items-start gap-3 transition-colors ${itemClass}`}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(draft.id)}
                                    onChange={() => handleSelectRow(draft.id)}
                                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <div className="font-medium text-sm truncate" title={draft.masterData?.title}>
                                            {draft.masterData?.title}
                                        </div>
                                        <span className="text-xs font-mono opacity-70">{new Date(draft.reporting_date).toLocaleDateString()}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex justify-between">
                                        <span>{draft.masterData?.code}</span>
                                        <span className="font-semibold">{draft.value} {draft.unit}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DraftsPanel;
