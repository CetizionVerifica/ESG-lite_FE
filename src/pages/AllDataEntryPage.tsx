import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import Dropdown from "../components/Dropdown";
import { getAssignedSiteMasterData, MasterData } from "../services/masterDataService";
import { createEntry, updateEntry } from "../services/allDataEntryService";
import { FilePlus } from "lucide-react";
import SingleDataEntryForm from "../components/SingleDataEntryForm";
import DataEntryList from "../components/DataEntryList";
import DraftsPanel from "../components/DraftsPanel";
import BulkUploadExcel from "../components/BulkUploadExcel";

const AllDataEntryPage = () => {
    const { user } = useAuth();
    const { isDark } = useTheme();

    interface Site {
        site_id: number;
        name: string;
    }

    const availableSites = useMemo<Site[]>(() => {
        const sites = user?.sites || [];
        const singleSite = user?.site || null;
        return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
    }, [user]);

    // State
    const [selectedSite, setSelectedSite] = useState<number | null>(
        availableSites.length > 0 ? availableSites[0].site_id : null
    );

    useEffect(() => {
        if (availableSites.length > 0 && !selectedSite) {
            setSelectedSite(availableSites[0].site_id);
        }
    }, [availableSites, selectedSite]);

    const [allMasterData, setAllMasterData] = useState<MasterData[]>([]);
    const [masterData, setMasterData] = useState<(MasterData & { is_active?: boolean; assigned_unit?: string })[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [activeTab, setActiveTab] = useState<'new' | 'history' | 'bulk'>('new');
    const [editingEntry, setEditingEntry] = useState<any>(null);

    const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
    const [selectedSubcategory, setSelectedSubcategory] = useState<number | null>(null);

    // Theme Classes
    const containerClass = isDark
        ? "p-6 bg-slate-900 min-h-screen text-slate-100"
        : "p-6 bg-gray-50 min-h-screen text-gray-900";

    // Fetch Data
    const fetchData = async () => {
        if (!selectedSite) return;
        setLoading(true);
        try {
            // Use getAssignedSiteMasterData to get ONLY assigned nodes and their ancestors
            const mdRes = await getAssignedSiteMasterData(selectedSite);
            setAllMasterData(mdRes);

            // Filter only Active KPIs for new entry selection
            const kpis = mdRes.filter((m: any) =>
                (m.type === "KPI Field" && m.is_active)
            );
            setMasterData(kpis);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        setSelectedCategory(null);
        setSelectedSubcategory(null);
    }, [selectedSite]);

    // Categories are root nodes in mdRes (type === Category)
    const categories = useMemo(() => {
        return allMasterData
            .filter(m => m.type === 'Category')
            .sort((a, b) => a.sequence - b.sequence);
    }, [allMasterData]);

    useEffect(() => {
        if (categories.length > 0 && !selectedCategory) {
            setSelectedCategory(categories[0].id);
        }
    }, [categories, selectedCategory]);

    // Subcategories belong to the selectedCategory
    const subcategories = useMemo(() => {
        if (!selectedCategory) return [];
        return allMasterData
            .filter(m => m.type === 'Subcategory' && m.parent?.id === selectedCategory)
            .sort((a, b) => a.sequence - b.sequence);
    }, [allMasterData, selectedCategory]);

    useEffect(() => {
        if (subcategories.length > 0 && (!selectedSubcategory || !subcategories.find(s => s.id === selectedSubcategory))) {
            setSelectedSubcategory(subcategories[0].id);
        } else if (subcategories.length === 0) {
            setSelectedSubcategory(null);
        }
    }, [subcategories, selectedSubcategory, selectedCategory]);

    // Active KPIs filtered by selected Subcategory
    const activeSubcategoryKpis = useMemo(() => {
        if (!selectedSubcategory) return [];
        return masterData.filter(m => {
            let curr = m.parent;
            while (curr) {
                if (curr.id === selectedSubcategory) return true;
                curr = curr.parent;
            }
            return false;
        });
    }, [masterData, selectedSubcategory]);

    const handleSingleSubmit = async (data: any | any[]) => {
        if (!selectedSite) return;
        try {
            if (editingEntry && !Array.isArray(data)) {
                // Edit Mode - Single Entry
                await updateEntry(editingEntry.id, {
                    value: data.value,
                    text_value: data.text_value,
                    unit: data.unit,
                    reporting_date: data.reportingDate,
                    notes: data.notes,
                    status: data.status,
                    evidence_path: data.evidence_path,
                });
            } else if (Array.isArray(data)) {
                // Create or Update Mode - Multiple Entries
                const promises = data.map((entry: any) => {
                    if (entry.entryId) {
                        return updateEntry(entry.entryId, {
                            value: entry.value,
                            text_value: entry.text_value,
                            unit: entry.unit,
                            reporting_date: entry.reportingDate,
                            notes: entry.notes,
                            status: entry.status,
                            evidence_path: entry.evidence_path,
                        });
                    } else {
                        return createEntry({
                            site_id: selectedSite,
                            master_data_id: entry.kpiId,
                            value: entry.value,
                            text_value: entry.text_value,
                            unit: entry.unit,
                            reporting_date: entry.reportingDate,
                            notes: entry.notes,
                            status: entry.status,
                            evidence_path: entry.evidence_path,
                        } as any);
                    }
                });

                await Promise.all(promises);
            } else {
                // Fallback for single create (just in case)
                await createEntry({
                    site_id: selectedSite,
                    master_data_id: data.kpiId,
                    value: data.value,
                    text_value: data.text_value,
                    unit: data.unit,
                    reporting_date: data.reportingDate,
                    notes: data.notes,
                    status: data.status,
                    evidence_path: data.evidence_path,
                } as any);
            }

            setRefreshTrigger(prev => prev + 1);
            setEditingEntry(null);
            if (activeTab === 'new') setActiveTab('history');
        } catch (error: any) {
            console.error("Single/Multi Submit Error", error);
            throw error;
        }
    };

    return (
        <div className={containerClass}>
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold">{editingEntry ? 'Edit Data Entry' : 'Data Entry'}</h1>

                    {availableSites.length > 1 && (
                        <div className="w-64">
                            <Dropdown
                                options={availableSites.map(s => ({ id: s.site_id, label: s.name }))}
                                value={selectedSite}
                                onChange={(opt) => setSelectedSite(opt?.id as number)}
                                placeholder="Select Site"
                            />
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading...</div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Category Tabs */}
                    {categories.length > 0 && (
                        <div className="flex overflow-x-auto whitespace-nowrap scrollbar-hide gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    className={`px-5 py-2 rounded-t-lg font-semibold text-sm transition-colors whitespace-nowrap ${selectedCategory === cat.id
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                                        }`}
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    {cat.title}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Subcategory Tabs */}
                    {subcategories.length > 0 && selectedCategory && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {subcategories.map((sub) => (
                                <button
                                    key={sub.id}
                                    className={`px-4 py-1.5 rounded-full font-medium text-xs transition-colors border ${selectedSubcategory === sub.id
                                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-500'
                                        : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                        }`}
                                    onClick={() => setSelectedSubcategory(sub.id)}
                                >
                                    {sub.title}
                                </button>
                            ))}
                        </div>
                    )}

                    <div>
                        {/* Main Content Area Container */}
                        <div className="w-full">
                            {/* Action Tabs - Full Width now */}
                            <div className="flex overflow-x-auto whitespace-nowrap scrollbar-hide border-b border-gray-200 dark:border-slate-700 mb-6 bg-white dark:bg-slate-800/50 rounded-t-lg px-2 pt-2">
                                <button
                                    className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'new' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                    onClick={() => { setActiveTab('new'); setEditingEntry(null); }}
                                >
                                    {editingEntry ? 'Edit Entry' : 'Data Entry'}
                                </button>
                                <button
                                    className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'bulk' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                    onClick={() => { setActiveTab('bulk'); setEditingEntry(null); }}
                                >
                                    <span className="flex items-center gap-2 whitespace-nowrap"><FilePlus size={16} /> Bulk Excel Upload</span>
                                </button>
                                <button
                                    className={`px-4 py-2 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                    onClick={() => { setActiveTab('history'); setEditingEntry(null); }}
                                >
                                    Entry History
                                </button>
                            </div>

                            {/* Inner Grid for Content + Sidebar */}
                            <div className="grid grid-cols-12 gap-6">
                                <div className={user?.role === 'User' ? "col-span-12 lg:col-span-9" : "col-span-12"}>
                                    {/* Content based on Action Tab */}
                                    {activeTab === 'bulk' && selectedSite && (
                                        <BulkUploadExcel
                                            siteId={selectedSite}
                                            userRole={user?.role}
                                            allMasterData={allMasterData}
                                            onUploadSuccess={() => {
                                                setRefreshTrigger(p => p + 1);
                                                setActiveTab('history');
                                            }}
                                            forcedCategory={selectedCategory}
                                            forcedSubcategory={selectedSubcategory}
                                        />
                                    )}

                                    {activeTab === 'new' && (
                                        <SingleDataEntryForm
                                            masterData={activeSubcategoryKpis}
                                            allMasterData={allMasterData}
                                            onSubmit={handleSingleSubmit}
                                            onCancel={() => { setEditingEntry(null); setActiveTab('history'); }}
                                            isDark={isDark}
                                            siteId={selectedSite!}
                                            userRole={user?.role}
                                            initialData={editingEntry}
                                        />
                                    )}

                                    {activeTab === 'history' && selectedSite && (
                                        <div className="max-w-full">
                                            <DataEntryList
                                                siteId={selectedSite}
                                                refreshTrigger={refreshTrigger}
                                                allMasterData={allMasterData}
                                                onEdit={(entry) => { setEditingEntry(entry); setActiveTab('new'); }}
                                                onDataChange={() => setRefreshTrigger(prev => prev + 1)}
                                                categoryId={selectedCategory}
                                                subcategoryId={selectedSubcategory}
                                            />
                                        </div>
                                    )}
                                </div>
                                {/* Drafts Sidebar - Only for Users */}
                                {user?.role === 'User' && (
                                    <div className="col-span-12 lg:col-span-3 h-[calc(100vh-200px)] sticky top-6">
                                        <DraftsPanel
                                            siteId={selectedSite}
                                            refreshTrigger={refreshTrigger}
                                            onEntrySubmit={() => setRefreshTrigger(prev => prev + 1)}
                                            categoryId={selectedCategory}
                                            subcategoryId={selectedSubcategory}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AllDataEntryPage;