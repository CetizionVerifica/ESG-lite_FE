import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import Dropdown from "../components/Dropdown";
import { getAssignedSiteMasterData, MasterData } from "../services/masterDataService";
import { createEntry, updateEntry } from "../services/allDataEntryService";
import SingleDataEntryForm from "../components/SingleDataEntryForm";
import DataEntryList from "../components/DataEntryList";
import { getSites } from "../services/siteService";
import BulkUploadExcel from "../components/BulkUploadExcel";
import { FilePlus, Database } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const SuperAdminAllDataEntryPage = () => {
    const { isDark } = useTheme();
    const { user } = useAuth(); // for passing userRole to components

    // State
    const [allSites, setAllSites] = useState<{ site_id: number; name: string }[]>([]);
    const [selectedSite, setSelectedSite] = useState<number | null>(null);

    const [allMasterData, setAllMasterData] = useState<MasterData[]>([]);
    const [masterData, setMasterData] = useState<(MasterData & { is_active?: boolean; assigned_unit?: string })[]>([]);
    const [loading, setLoading] = useState(false);
    const [sitesLoading, setSitesLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [editingEntry, setEditingEntry] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'new' | 'history' | 'bulk'>('new');

    const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
    const [selectedSubcategory, setSelectedSubcategory] = useState<number | null>(null);

    // Theme Classes
    const containerClass = isDark
        ? "p-6 bg-slate-900 min-h-screen text-slate-100"
        : "p-6 bg-gray-50 min-h-screen text-gray-900";

    // Fetch All Sites for Super Admin
    useEffect(() => {
        const fetchSites = async () => {
            try {
                const sites = await getSites();
                setAllSites(sites);
            } catch (error) {
                console.error("Error fetching sites:", error);
            } finally {
                setSitesLoading(false);
            }
        };
        fetchSites();
    }, []);

    // Fetch Master Data when Site Changes
    useEffect(() => {
        const fetchData = async () => {
            if (!selectedSite) {
                setAllMasterData([]);
                setMasterData([]);
                return;
            }
            setLoading(true);
            try {
                const mdRes = await getAssignedSiteMasterData(selectedSite);
                setAllMasterData(mdRes);
                const kpis = mdRes.filter((m: any) => m.type === "KPI Field" && m.is_active);
                setMasterData(kpis);
            } catch (error) {
                console.error("Error fetching master data:", error);
            } finally {
                setLoading(false);
            }
        };
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
                // Create Mode - Multiple Entries
                const promises = data.map((entry: any) =>
                    createEntry({
                        site_id: selectedSite,
                        master_data_id: entry.kpiId,
                        value: entry.value,
                        text_value: entry.text_value,
                        unit: entry.unit,
                        reporting_date: entry.reportingDate,
                        notes: entry.notes,
                        status: entry.status,
                        evidence_path: entry.evidence_path,
                    } as any)
                );

                await Promise.all(promises);
            } else {
                // Fallback single create
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
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            console.error("Single/Multi Submit Error", error);
            throw error; // Propagate error to form component
        }
    };

    return (
        <div className={containerClass}>
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold">{editingEntry ? 'Edit Entry' : 'Super Admin Data Management'}</h1>
                    <div className="w-64">
                        {sitesLoading ? (
                            <div className="text-sm text-gray-500">Loading Sites...</div>
                        ) : (
                            <Dropdown
                                options={allSites.map(s => ({ id: s.site_id, label: s.name }))}
                                value={selectedSite}
                                onChange={(opt) => setSelectedSite(opt?.id as number)}
                                placeholder="Select Site to Manage"
                                searchable
                            />
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-10">Loading Master Data...</div>
            ) : !selectedSite ? (
                <div className="text-center py-20 bg-gray-100 dark:bg-slate-800 rounded-lg">
                    <p className="text-gray-500 dark:text-slate-400">Please select a site to start data operations.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Category Tabs */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-700 pb-2">
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    className={`px-5 py-2 rounded-t-lg font-semibold text-sm transition-colors ${selectedCategory === cat.id
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

                    <div className="grid grid-cols-12 gap-6">
                        <div className="col-span-12">
                            {/* Tabs */}
                            <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto whitespace-nowrap bg-white dark:bg-slate-800/50 rounded-t-lg px-2 pt-2">
                                <button
                                    className={`px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'new' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 focus:outline-none' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none'}`}
                                    onClick={() => { setActiveTab('new'); setEditingEntry(null); }}
                                >
                                    {editingEntry ? 'Edit Entry' : 'Single Data Entry'}
                                </button>
                                <button
                                    className={`px-4 py-3 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === 'bulk' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 focus:outline-none' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none'}`}
                                    onClick={() => { setActiveTab('bulk'); setEditingEntry(null); }}
                                >
                                    <FilePlus size={16} /> Bulk Excel Upload
                                </button>
                                <button
                                    className={`px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 focus:outline-none' : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none'}`}
                                    onClick={() => { setActiveTab('history'); setEditingEntry(null); }}
                                >
                                    Entry History
                                </button>
                                
                            </div>

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

                            {activeTab === 'new' && selectedSite && (
                                <SingleDataEntryForm
                                    masterData={activeSubcategoryKpis}
                                    allMasterData={allMasterData}
                                    onSubmit={handleSingleSubmit}
                                    onCancel={() => { setEditingEntry(null); setActiveTab('history'); }}
                                    isDark={isDark}
                                    siteId={selectedSite}
                                    userRole={user?.role || "Superadmin"}
                                    initialData={editingEntry}
                                />
                            )}

                            {activeTab === 'history' && selectedSite && (
                                <div className="max-w-full">
                                    <DataEntryList
                                        siteId={selectedSite}
                                        refreshTrigger={refreshTrigger}
                                        allMasterData={allMasterData}
                                        onEdit={(entry) => {
                                            setEditingEntry(entry);
                                            setActiveTab('new');
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        categoryId={selectedCategory}
                                        subcategoryId={selectedSubcategory}
                                    />
                                </div>
                            )}

                            
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminAllDataEntryPage;
