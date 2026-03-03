import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getEntries, deleteEntry, reviewEntry, bulkUpdateStatus } from '../services/allDataEntryService';
import { Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { getYearOptions } from '../utils/dateUtils';
import toast from 'react-hot-toast';
import ConfirmationModal from './ConfirmationModal';

interface DataEntryListProps {
    siteId: number | null;
    refreshTrigger: number;
    allMasterData: any[];
    onEdit?: (entry: any) => void;
    onDataChange?: () => void;
    categoryId?: number | null;
    subcategoryId?: number | null;
}

const DataEntryList: React.FC<DataEntryListProps> = ({ siteId, refreshTrigger, allMasterData, onEdit, onDataChange, categoryId, subcategoryId }) => {
    const { user } = useAuth();
    const { isDark } = useTheme();
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<number | null>(null);

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterMonth, setFilterMonth] = useState<string>(new Date().getMonth() + 1 + "");
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear() + "");
    const [searchQuery, setSearchQuery] = useState<string>('');



    const fetchEntries = async () => {
        if (!siteId) return;
        setLoading(true);
        try {
            const data = await getEntries({
                site_id: siteId,
                status: filterStatus || undefined,
                month: filterMonth ? parseInt(filterMonth) : undefined,
                year: filterYear ? parseInt(filterYear) : undefined,
                category_id: categoryId !== undefined ? (categoryId || undefined) : undefined,
                subcategory_id: subcategoryId !== undefined ? (subcategoryId || undefined) : undefined
            });
            setEntries(data);
            setSelectedIds([]); // Clear selection on refresh
        } catch (error) {
            console.error("Failed to fetch entries", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, [siteId, refreshTrigger, filterStatus, filterMonth, filterYear, categoryId, subcategoryId]);

    const handleDelete = (id: number) => {
        setItemToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            await deleteEntry(itemToDelete);
            toast.success("Entry deleted successfully");
            fetchEntries();
            if (onDataChange) onDataChange();
        } catch (error) {
            toast.error("Failed to delete entry");
        } finally {
            setItemToDelete(null);
            setIsDeleteModalOpen(false);
        }
    };

    const handleReview = async (id: number, status: string) => {
        try {
            await reviewEntry(id, status);
            fetchEntries();
            if (onDataChange) onDataChange();
        } catch (error) {
            console.error("Review failed", error);
            toast.error("Failed to update status");
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // User can select Draft/Rejected for submission. Managers/Admins can select non-verified and non-draft entries for bulk approval/rejection.
            const p = entries.filter(e => {
                if (user?.role === 'User') {
                    return e.status === 'Draft' || e.status === 'Rejected';
                } else {
                    return e.status !== 'Verified' && e.status !== 'Draft';
                }
            }).map(e => e.id);
            setSelectedIds(p);
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectRow = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBulkAction = async (action: string) => {
        if (selectedIds.length === 0) {
            toast.error("No entries selected.");
            return;
        }

        try {
            if (user?.role === 'User') {
                await bulkUpdateStatus(selectedIds, 'Ready for Review');
                toast.success("Entries submitted successfully!");
            } else {
                await bulkUpdateStatus(selectedIds, action);
                toast.success(`Entries correctly marked as ${action}!`);
            }
            setSelectedIds([]);
            fetchEntries();
            if (onDataChange) onDataChange();
        } catch (error) {
            console.error("Bulk Action Error", error);
            toast.error("Failed to process bulk action.");
        }
    };

    // Styling
    const cardClass = isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-gray-200 text-gray-900";
    const thClass = isDark ? "bg-slate-900/50 text-slate-400" : "bg-gray-50 text-gray-500";
    const tdClass = isDark ? "border-slate-700" : "border-gray-100";

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Verified': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
            case 'Submitted': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'Ready for Review': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
            case 'Rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            default: return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300';
        }
    };

    return (
        <div className={`rounded-xl border shadow-sm overflow-hidden ${cardClass}`}>
            <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-lg">Entry History</h3>
                </div>

                <div className="flex flex-col md:flex-row md:flex-wrap gap-3">
                    <select
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        className={`w-full md:w-auto text-sm rounded-md px-3 py-2 border outline-none ${isDark ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-300"}`}
                    >
                        <option value="">Month</option>
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
                        ))}
                    </select>

                    <select
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className={`w-full md:w-auto text-sm rounded-md px-3 py-2 border outline-none ${isDark ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-300"}`}
                    >
                        <option value="">Year</option>
                        {getYearOptions().map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>

                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className={`w-full md:w-auto text-sm rounded-md px-3 py-2 border outline-none ${isDark ? "bg-slate-700 border-slate-600" : "bg-gray-50 border-gray-300"}`}
                    >
                        <option value="">All Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Pending">Ready for Review</option>
                        <option value="Submitted">Submitted (Manager Approved)</option>
                        <option value="Verified">Verified</option>
                        <option value="Rejected">Rejected</option>
                    </select>

                    <input
                        type="text"
                        placeholder="Search KPIs, Headings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`w-full md:w-auto text-sm rounded-md px-3 py-2 border outline-none min-w-[200px] flex-grow md:flex-grow-0 md:ml-auto ${isDark ? "bg-slate-700 border-slate-600 focus:border-blue-500" : "bg-white border-gray-300 focus:border-blue-500"}`}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                {/* Bulk Actions Bar */}
                {selectedIds.length > 0 && (
                    <div className={`mb-4 mx-6 p-3 rounded-lg flex items-center justify-between ${isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
                        <span className={`text-sm font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                            {selectedIds.length} entries selected
                        </span>
                        <div className="flex gap-2">
                            {user?.role === 'User' ? (
                                <button
                                    onClick={() => handleBulkAction('Ready for Review')}
                                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                                >
                                    Submit Selected for Review
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleBulkAction('Submitted')}
                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                                    >
                                        Mark as Submitted
                                    </button>
                                    <button
                                        onClick={() => handleBulkAction('Verified')}
                                        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                                    >
                                        Verify Selected
                                    </button>
                                    <button
                                        onClick={() => handleBulkAction('Rejected')}
                                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                                    >
                                        Reject Selected
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase font-medium ${thClass}`}>
                        <tr>
                            <th className="px-6 py-3 w-10">
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={entries.length > 0 && selectedIds.length === entries.length}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            <th className="px-6 py-3">Reporting Date</th>
                            <th className="px-6 py-3">KPI</th>
                            <th className="px-6 py-3">Value</th>
                            <th className="px-6 py-3">Unit</th>
                            <th className="px-6 py-3">Notes</th>
                            <th className="px-6 py-3">Evidence</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">Loading entries...</td></tr>
                        ) : entries.length === 0 ? (
                            <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">No entries found for this site.</td></tr>
                        ) : (
                            entries.filter(entry => {
                                if (!searchQuery) return true;
                                const lowerQuery = searchQuery.toLowerCase();
                                const kpiTitle = entry.masterData?.title?.toLowerCase() || '';
                                const kpiCode = entry.masterData?.code?.toLowerCase() || '';

                                // Get hierarchy titles from allMasterData using the masterData id
                                let parentTitles = '';
                                const findParents = (id: number) => {
                                    let curr = allMasterData.find(m => m.id === id);
                                    while (curr && curr.parent) {
                                        const parentId = curr.parent.id || (typeof curr.parent === 'number' ? curr.parent : null);
                                        const parentObj = allMasterData.find(m => m.id === parentId);
                                        if (parentObj) {
                                            parentTitles += ' ' + parentObj.title.toLowerCase();
                                            curr = parentObj;
                                        } else {
                                            break;
                                        }
                                    }
                                };
                                if (entry.masterData?.id) {
                                    findParents(entry.masterData.id);
                                }

                                return kpiTitle.includes(lowerQuery) || kpiCode.includes(lowerQuery) || parentTitles.includes(lowerQuery);
                            }).map((entry) => (
                                <tr key={entry.id} className={`border-b last:border-0 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${tdClass}`}>
                                    <td className="px-6 py-4">
                                        {/* User selection logic */}
                                        {(user?.role === 'User' && (entry.status === 'Draft' || entry.status === 'Rejected')) && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(entry.id)}
                                                onChange={() => handleSelectRow(entry.id)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        )}
                                        {/* Manager/Admin selection logic */}
                                        {(['Manager', 'Admin', 'Superadmin'].includes(user?.role || '') && entry.status !== 'Verified' && entry.status !== 'Draft') && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(entry.id)}
                                                onChange={() => handleSelectRow(entry.id)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 font-medium">{new Date(entry.reporting_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium">{entry.masterData?.code}</div>
                                        <div className="text-xs opacity-70 truncate max-w-[200px]">{entry.masterData?.title}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono">{entry.text_value || entry.value}</td>
                                    <td className="px-6 py-4">{entry.unit}</td>
                                    <td className="px-6 py-4 max-w-[150px] truncate" title={entry.notes}>{entry.notes || '-'}</td>
                                    <td className="px-6 py-4 max-w-[150px] truncate" title={entry.evidence_path}>
                                        {entry.evidence_path ? (
                                            <a href={entry.evidence_path} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                                View
                                            </a>
                                        ) : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {/* User Actions: Edit/Delete */}
                                            {user?.role === 'User' && (entry.status === 'Draft' || entry.status === 'Ready for Review' || entry.status === 'Rejected') && (
                                                <button onClick={() => onEdit && onEdit(entry)} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Edit">
                                                    <Edit size={16} />
                                                </button>
                                            )}
                                            {/* Manager/Admin Edit: Anything not Verified/Rejected */}
                                            {['Manager', 'Admin', 'Superadmin'].includes(user?.role || '') && entry.status !== 'Verified' && entry.status !== 'Rejected' && (
                                                <button onClick={() => onEdit && onEdit(entry)} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Edit">
                                                    <Edit size={16} />
                                                </button>
                                            )}

                                            {/* Delete: Only Drafts and Rejected (User) */}
                                            {(user?.role === 'User' && (entry.status === 'Draft' || entry.status === 'Rejected')) && (
                                                <>
                                                    <button onClick={() => handleDelete(entry.id)} className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}

                                            {/* Manager Actions: Review Pending -> Submitted OR Submitted -> Verified/Rejected */}
                                            {(user?.role === 'Manager') && (
                                                <>
                                                    {/* Approve Ready for Review -> Submitted */}
                                                    {entry.status === 'Ready for Review' && (
                                                        <button onClick={() => handleReview(entry.id, 'Submitted')} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Submit">
                                                            <CheckCircle size={18} />
                                                        </button>
                                                    )}

                                                    {/* Verify/Reject Submitted (or Ready for Review) */}
                                                    {(entry.status === 'Submitted' || entry.status === 'Ready for Review') && (
                                                        <>
                                                            <button onClick={() => handleReview(entry.id, 'Verified')} className="p-1.5 text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors" title="Verify">
                                                                <CheckCircle size={18} className="text-green-600" />
                                                            </button>
                                                            <button onClick={() => handleReview(entry.id, 'Rejected')} className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Reject">
                                                                <XCircle size={18} className="text-red-600" />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}

                                            {/* Admin Actions: Same as Manager + Verify */}
                                            {((user?.role === 'Admin' || user?.role === 'Superadmin')) && (
                                                <>
                                                    {/* Approve Ready for Review -> Submitted */}
                                                    {entry.status === 'Ready for Review' && (
                                                        <button onClick={() => handleReview(entry.id, 'Submitted')} className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Submit">
                                                            <CheckCircle size={18} />
                                                        </button>
                                                    )}

                                                    {/* Verify/Reject */}
                                                    {(entry.status === 'Submitted' || entry.status === 'Ready for Review') && (
                                                        <>
                                                            <button onClick={() => handleReview(entry.id, 'Verified')} className="p-1.5 text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors" title="Verify">
                                                                <CheckCircle size={18} className="text-green-600" />
                                                            </button>
                                                            <button onClick={() => handleReview(entry.id, 'Rejected')} className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Reject">
                                                                <XCircle size={18} className="text-red-600" />
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Delete Entry"
                message="Are you sure you want to delete this draft entry? This action cannot be undone."
                confirmLabel="Delete"
                isDanger
                isDark={isDark}
            />
        </div >
    );
};

export default DataEntryList;
