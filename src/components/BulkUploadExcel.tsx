import React, { useState, useMemo } from 'react';
import { Upload, FileDown, CheckCircle } from "lucide-react";
import Dropdown from './Dropdown';
import { parseBulkExcel, storeBulkExcel, downloadDemoExcel } from '../services/allDataEntryService';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { MasterData } from '../services/masterDataService';

interface BulkUploadExcelProps {
    siteId: number;
    userRole?: string;
    onUploadSuccess: () => void;
    allMasterData: MasterData[];
    forcedCategory?: number | null;
    forcedSubcategory?: number | null;
}

const BulkUploadExcel: React.FC<BulkUploadExcelProps> = ({ siteId, userRole, onUploadSuccess, allMasterData, forcedCategory, forcedSubcategory }) => {
    const { isDark } = useTheme();
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkMonth, setBulkMonth] = useState<number | 'all'>(new Date().getMonth() + 1);
    const [bulkYear, setBulkYear] = useState<number>(new Date().getFullYear());
    const [localSelectedCategory, setLocalSelectedCategory] = useState<number | null>(null);
    const [localSelectedSubcategory, setLocalSelectedSubcategory] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [previewData, setPreviewData] = useState<any[] | null>(null);

    const selectedCategory = forcedCategory !== undefined ? forcedCategory : localSelectedCategory;
    const selectedSubcategory = forcedSubcategory !== undefined ? forcedSubcategory : localSelectedSubcategory;

    const activeKPIs = useMemo(() => {
        return allMasterData.filter(d => d.type === 'KPI Field' && (d as any).is_active);
    }, [allMasterData]);

    const activeCategoryIds = useMemo(() => {
        const ids = new Set<number>();
        activeKPIs.forEach(kpi => {
            let curr: any = kpi;
            while (curr) {
                if (curr.type === 'Category') ids.add(curr.id);
                curr = curr.parent;
            }
        });
        return ids;
    }, [activeKPIs]);

    const activeSubcategoryIds = useMemo(() => {
        const ids = new Set<number>();
        activeKPIs.forEach(kpi => {
            let curr: any = kpi;
            while (curr) {
                if (curr.type === 'Subcategory') ids.add(curr.id);
                curr = curr.parent;
            }
        });
        return ids;
    }, [activeKPIs]);

    const categories = useMemo(() => {
        return allMasterData.filter(d => d.type === 'Category' && d.status === 'Active' && activeCategoryIds.has(d.id));
    }, [allMasterData, activeCategoryIds]);

    const subcategories = useMemo(() => {
        if (!selectedCategory) return [];
        return allMasterData.filter(
            d => d.type === 'Subcategory' && d.status === 'Active' && d.parent?.id === selectedCategory && activeSubcategoryIds.has(d.id)
        );
    }, [selectedCategory, allMasterData, activeSubcategoryIds]);

    const handleParse = async () => {
        if (!bulkFile || !siteId) return;
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('site_id', siteId.toString());
            formData.append('year', bulkYear.toString());
            if (bulkMonth !== 'all') {
                formData.append('month', bulkMonth.toString());
            }
            if (selectedCategory) formData.append('category_id', selectedCategory.toString());
            if (selectedSubcategory) formData.append('subcategory_id', selectedSubcategory.toString());
            formData.append('file', bulkFile);

            const res = await parseBulkExcel(formData);
            if (res.parsedEntries && res.parsedEntries.length > 0) {
                setPreviewData(res.parsedEntries);
                toast.success(`Parsed ${res.parsedEntries.length} entries. Please review below.`);
                if (res.errors && res.errors.length > 0) {
                    res.errors.forEach((err: string) => toast.error(err));
                }
            } else {
                toast.error("No valid data found in the file.");
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to parse Excel file.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleStore = async () => {
        if (!previewData || !siteId) return;
        setIsUploading(true);
        try {
            const status = userRole === 'User' ? 'Draft' : 'Draft';
            const payload = {
                site_id: siteId,
                status,
                entries: previewData
            };
            const res = await storeBulkExcel(payload);
            toast.success(`Stored successfully: ${res.createdCount} created, ${res.skippedCount} skipped.`);
            // if (res.errors && res.errors.length > 0) {
            //     res.errors.forEach((err: string) => toast.error(err));
            // }
            setPreviewData(null);
            setBulkFile(null);
            onUploadSuccess();
        } catch (error: any) {
            toast.error(error.response?.data?.message || "Failed to store data.");
        } finally {
            setIsUploading(false);
        }
    };

    const updatePreviewRow = (index: number, field: string, value: any) => {
        setPreviewData(prev => {
            if (!prev) return null;
            const newData = [...prev];
            newData[index] = { ...newData[index], [field]: value };
            return newData;
        });
    };

    const handleDownloadDemo = async () => {
        if (!siteId) return;
        try {
            const blob = await downloadDemoExcel(siteId, selectedCategory, selectedSubcategory, bulkMonth, bulkYear);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ESG_Data_Upload_Template_Site${siteId}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Demo file downloaded successfully!");
        } catch (error) {
            console.error("Download Demo Error:", error);
            toast.error("Failed to download demo file.");
        }
    };

    return (
        <div className={isDark ? "bg-slate-800 border-slate-700 rounded-xl p-8 shadow-lg" : "bg-white border-gray-200 rounded-xl p-8 shadow-md"}>
            <div className="mb-6">
                <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Bulk Data Upload {forcedCategory && (
                        <span className="text-blue-600 dark:text-blue-400 font-medium ml-2 text-lg">
                            • {categories.find(c => c.id === forcedCategory)?.title || "Category"}
                            {forcedSubcategory && ` > ${subcategories.find(s => s.id === forcedSubcategory)?.title || "Subcategory"}`}
                        </span>
                    )}
                </h2>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                    {forcedCategory
                        ? "Download the template for the currently selected section, fill it out, and upload here."
                        : "Upload an Excel file to automatically extract and populate data for multiple KPIs assigned to this site."}
                </p>
            </div>

            {!previewData ? (
                <>
                    {!forcedCategory && (
                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className={`text-sm font-medium mb-1 block ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Category Filter (Optional)</label>
                                <Dropdown
                                    options={categories.map(c => ({ id: c.id, label: c.title }))}
                                    value={selectedCategory}
                                    onChange={(opt) => {
                                        setLocalSelectedCategory(opt?.id as number || null);
                                        setLocalSelectedSubcategory(null);
                                    }}
                                    placeholder="All Categories"
                                />
                            </div>
                            <div>
                                <label className={`text-sm font-medium mb-1 block ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Subcategory Filter (Optional)</label>
                                <Dropdown
                                    options={subcategories.map(s => ({ id: s.id, label: s.title }))}
                                    value={selectedSubcategory}
                                    onChange={(opt) => setLocalSelectedSubcategory(opt?.id as number || null)}
                                    placeholder={selectedCategory ? "All Subcategories" : "Select a Category first"}
                                    disabled={!selectedCategory}
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <div>
                            <label className={`text-sm font-medium mb-1 block ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Target Month(s) for File/Demo</label>
                            <Dropdown
                                options={[
                                    { id: 'all', label: 'All Year (12 Months)' },
                                    ...Array.from({ length: 12 }, (_, i) => ({ id: i + 1, label: new Date(0, i).toLocaleString('en', { month: 'long' }) }))
                                ]}
                                value={bulkMonth}
                                onChange={(opt) => setBulkMonth(opt?.id as number | 'all')}
                            />
                        </div>
                        <div>
                            <label className={`text-sm font-medium mb-1 block ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Target Year</label>
                            <Dropdown
                                options={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => ({ id: y, label: y.toString() }))}
                                value={bulkYear}
                                onChange={(opt) => setBulkYear(opt?.id as number)}
                            />
                        </div>
                    </div>

                    <div className={`border-2 border-dashed rounded-lg p-10 text-center ${isDark ? 'border-slate-600 bg-slate-700' : 'border-gray-300 bg-gray-50'}`}>
                        <input
                            type="file"
                            id="excel-upload"
                            className="hidden"
                            accept=".xlsx, .xls"
                            onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                        />
                        <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center">
                            {bulkFile ? (
                                <>
                                    <CheckCircle className="text-green-500 mb-3" size={32} />
                                    <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{bulkFile.name}</p>
                                    <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Click to change file</p>
                                </>
                            ) : (
                                <>
                                    <Upload className={`mb-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`} size={32} />
                                    <p className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Click to select file</p>
                                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Supports .xlsx, .xls</p>
                                </>
                            )}
                        </label>
                    </div>

                    <div className="mt-8 flex justify-end gap-4">
                        <button
                            onClick={handleDownloadDemo}
                            className={`px-6 py-2 rounded-md font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all shadow-sm`}
                        >
                            Download Demo File
                        </button>
                        <button
                            disabled={!bulkFile || isUploading}
                            onClick={handleParse}
                            className={`px-6 py-2 rounded-md font-medium text-white shadow flex items-center gap-2 transition-all ${(!bulkFile || isUploading) ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {isUploading ? "Parsing..." : <><FileDown size={18} /> Parse Upload</>}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>Preview Extracted Data ({previewData.length} entries)</h3>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setPreviewData(null)}
                                className={`px-4 py-2 rounded-md font-medium transition-all ${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                Back
                            </button>
                            <button
                                disabled={isUploading}
                                onClick={handleStore}
                                className={`px-6 py-2 rounded-md font-medium text-white bg-green-600 hover:bg-green-700 shadow-sm disabled:opacity-50`}
                            >
                                {isUploading ? "Storing..." : "Store Data"}
                            </button>
                        </div>
                    </div>

                    <div className={`overflow-x-auto rounded-lg border ${isDark ? 'border-slate-700/50' : 'border-gray-200'} max-h-[600px] scrollbar-thin ${isDark ? 'scrollbar-thumb-slate-600 scrollbar-track-transparent' : 'scrollbar-thumb-gray-300 scrollbar-track-transparent'}`}>
                        <table className="min-w-full text-sm text-left border-collapse">
                            <thead className={`text-xs uppercase sticky top-0 z-10 ${isDark ? 'bg-slate-800/90 text-slate-400 font-semibold tracking-wider backdrop-blur-sm' : 'bg-gray-50/90 text-gray-500 font-semibold tracking-wider backdrop-blur-sm'}`}>
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Code / Title</th>
                                    <th className="px-4 py-3 font-semibold w-24">Month</th>
                                    <th className="px-4 py-3 font-semibold w-24">Year</th>
                                    <th className="px-4 py-3 font-semibold w-32">Value</th>
                                    <th className="px-4 py-3 font-semibold w-32">Unit</th>
                                    <th className="px-4 py-3 font-semibold w-40">Notes</th>
                                    <th className="px-4 py-3 font-semibold w-40">Evidence Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previewData.map((row, idx) => (
                                    <tr key={idx} className={`border-b border-opacity-50 ${isDark ? 'border-slate-700 bg-slate-800' : 'border-gray-100 bg-white'}`}>
                                        <td className={`px-4 py-4 ${isDark ? 'text-slate-300' : 'text-gray-800'}`}>
                                            <div className="font-medium text-xs text-blue-500 mb-1">{row.kpi_code}</div>
                                            <div className={isDark ? 'text-slate-200' : 'text-gray-700'}>{row.kpi_title}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <input
                                                type="number"
                                                value={row.month || ''}
                                                onChange={(e) => updatePreviewRow(idx, 'month', Number(e.target.value))}
                                                className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <input
                                                type="number"
                                                value={row.year || ''}
                                                onChange={(e) => updatePreviewRow(idx, 'year', Number(e.target.value))}
                                                className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            {(() => {
                                                const kpi = allMasterData.find(m => m.code === row.kpi_code);
                                                const isText = (kpi as any)?.response_type === "Text";

                                                return isText ? (
                                                    <textarea
                                                        rows={2}
                                                        value={row.text_value || ''}
                                                        onChange={(e) => updatePreviewRow(idx, 'text_value', e.target.value)}
                                                        className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors resize-none ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                                    />
                                                ) : (
                                                    <input
                                                        type="number"
                                                        value={row.value || ''}
                                                        onChange={(e) => updatePreviewRow(idx, 'value', Number(e.target.value))}
                                                        className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                                    />
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-4">
                                            <input
                                                type="text"
                                                value={row.unit || ''}
                                                onChange={(e) => updatePreviewRow(idx, 'unit', e.target.value)}
                                                className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <textarea
                                                rows={2}
                                                value={row.notes || ''}
                                                onChange={(e) => updatePreviewRow(idx, 'notes', e.target.value)}
                                                className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors resize-none ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                            />
                                        </td>
                                        <td className="px-4 py-4">
                                            <input
                                                type="text"
                                                value={row.evidence_path || ''}
                                                onChange={(e) => updatePreviewRow(idx, 'evidence_path', e.target.value)}
                                                className={`w-full px-3 py-2 rounded-md shadow-sm border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors ${isDark ? 'bg-slate-700/80 text-white placeholder-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-900 placeholder-gray-400 hover:bg-gray-200'}`}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default BulkUploadExcel;
