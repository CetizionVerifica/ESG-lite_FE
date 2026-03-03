import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
interface MasterData {
    id: number;
    title: string;
    code: string;
    type: string;
    response_type?: "Numeric" | "Text";
    parent?: MasterData | null;
    is_active?: boolean;
    assigned_unit?: string;
    children?: MasterData[];
}
import Dropdown from './Dropdown';
import { Calendar } from 'lucide-react';
import { getEntries } from '../services/allDataEntryService';

interface SingleDataEntryFormProps {
    masterData: (MasterData & { assigned_unit?: string, is_active?: boolean })[]; // Active KPIs
    allMasterData: MasterData[]; // Full hierarchy for Categories
    onSubmit: (data: any | any[]) => Promise<void>;
    onCancel: () => void;
    isDark: boolean;
    siteId: number;
    userRole?: string;
    initialData?: any; // If provided, we're editing a single existing entry
}

// Interface for individual KPI form state
interface KpiFormData {
    kpiId: number;
    entryId?: number;
    responseType: "Numeric" | "Text";
    value: string;
    textValue: string;
    unit: string;
    notes: string;
    evidencePath: string;
}

const SingleDataEntryForm: React.FC<SingleDataEntryFormProps> = ({
    masterData,
    allMasterData,
    onSubmit,
    onCancel,
    isDark,
    siteId,
    userRole = 'User',
    initialData,
}) => {
    // State - Hierarchy Selection
    const [selectedIndicator, setSelectedIndicator] = useState<number | null>(null); // Sub-heading
    const [selectedDataHeading, setSelectedDataHeading] = useState<number | null>(null);

    // State - Global Form Data
    const [reportingDate, setReportingDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<string>('Draft');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State - Multi-KPI Form Data
    const [formData, setFormData] = useState<Record<number, KpiFormData>>({});

    const [monthEntries, setMonthEntries] = useState<any[]>([]);
    const [loadedMonth, setLoadedMonth] = useState<string>('');

    // Fetch existing month data
    useEffect(() => {
        if (initialData) return;

        const fetchMonthData = async () => {
            try {
                const dateObj = new Date(reportingDate);
                const month = dateObj.getMonth() + 1;
                const year = dateObj.getFullYear();
                const monthStr = `${year}-${month}`;

                const entries = await getEntries({ site_id: siteId, month, year });
                setMonthEntries(entries);
                setLoadedMonth(monthStr);
            } catch (err) {
                console.error("Failed to fetch month entries", err);
            }
        };
        fetchMonthData();
    }, [reportingDate, siteId, initialData]);

    // When reportingDate changes, clear unsaved formData
    useEffect(() => {
        if (!initialData) {
            setFormData({});
            setLoadedMonth('');
            setMonthEntries([]);
        }
    }, [reportingDate, initialData]);

    // Populate form if initialData provided (Edit Mode - Single KPI)
    useEffect(() => {
        if (initialData) {
            console.group("Edit Mode Auto-Population");
            console.log("Initial Data:", initialData);

            if (initialData.reporting_date) {
                setReportingDate(initialData.reporting_date.split('T')[0]);
            }
            setStatus(initialData.status || 'Draft');

            if (initialData.masterData) {
                const kpiId = initialData.masterData.id;
                const kpi = allMasterData.find(m => m.id === kpiId);
                console.log(`Target KPI ID: ${kpiId}`, kpi ? "Found" : "Not Found");

                if (kpi) {
                    // Populate hierarchy
                    let curr: MasterData | undefined | null = kpi;
                    console.log("Starting Hierarchy Trace from:", curr.title);

                    while (curr && curr.parent) {
                        const parentId: number = (curr.parent as MasterData).id;
                        const foundParent: MasterData | undefined = allMasterData.find(m => m.id === parentId);

                        console.log(` -> Parent ID: ${parentId}`, foundParent ? `Found (${foundParent.type})` : "Not Found");

                        if (foundParent) {
                            if (foundParent.type === 'Data Heading') setSelectedDataHeading(foundParent.id);
                            if (foundParent.type === 'Sub-heading') setSelectedIndicator(foundParent.id);

                            curr = foundParent;
                        } else {
                            console.warn("Break trace: Parent not found in list");
                            break;
                        }
                    }

                    // Populate form data for this single KPI
                    setFormData({
                        [kpiId]: {
                            kpiId: kpiId,
                            responseType: kpi.response_type || "Numeric",
                            value: initialData.value !== undefined && initialData.value !== null ? initialData.value.toString() : '',
                            textValue: initialData.text_value || '',
                            unit: initialData.unit || kpi.assigned_unit || 'NA',
                            notes: initialData.notes || '',
                            evidencePath: initialData.evidence_path || ''
                        }
                    });
                }
            }
            console.groupEnd();
        }
    }, [initialData, allMasterData]);

    // Role-Based Status Logic
    const statusOptions = useMemo(() => {
        const base = [{ id: 'Draft', label: 'Draft' }];

        // Creating New Entry
        if (!initialData) {
            if (userRole === 'User') return [...base, { id: 'Ready for Review', label: 'Submit for Review' }];
            if (userRole === 'Manager') return [...base, { id: 'Submitted', label: 'Direct Submit (Approved)' }];
            if (userRole === 'Admin' || userRole === 'Superadmin') return [...base, { id: 'Verified', label: 'Direct Verify' }];
            return base;
        }

        // Editing Existing Entry
        const currentStatus = initialData.status;

        // USER
        if (userRole === 'User') {
            return [...base, { id: 'Ready for Review', label: 'Submit for Review' }];
        }

        // MANAGER
        if (userRole === 'Manager') {
            if (currentStatus === 'Ready for Review') {
                return [
                    { id: 'Ready for Review', label: 'Ready for Review' },
                    { id: 'Submitted', label: 'Submit' },
                    { id: 'Verified', label: 'Verify' },
                    { id: 'Rejected', label: 'Reject' }
                ];
            }
            return [...base, { id: 'Ready for Review', label: 'Ready for Review' }, { id: 'Submitted', label: 'Submitted' }, { id: 'Verified', label: 'Verified' }, { id: 'Rejected', label: 'Rejected' }];
        }

        // ADMIN
        if (userRole === 'Admin' || userRole === 'Superadmin') {
            if (currentStatus === 'Submitted') {
                return [
                    { id: 'Submitted', label: 'Submitted (Pending Verification)' },
                    { id: 'Verified', label: 'Verify' },
                    { id: 'Rejected', label: 'Reject' }
                ];
            }
            return [...base, { id: 'Ready for Review', label: 'Pending Review' }, { id: 'Submitted', label: 'Submitted' }, { id: 'Verified', label: 'Verified' }, { id: 'Rejected', label: 'Rejected' }];
        }

        return base;
    }, [userRole, initialData]);



    // Strict Hierarchy Filtering
    // Calculate Valid Ancestors based on ASSIGNED ACTIVE KPIs
    const validAncestorIds = useMemo(() => {
        const ids = new Set<number>();

        const processKpi = (kpi: MasterData) => {
            ids.add(kpi.id);
            let curr: MasterData | undefined | null = kpi;
            // Traverse up using parent references strictly
            // If parent reference object is missing but ID exists, find it in allMasterData
            while (curr && curr.parent) {
                const parentId: number = (curr.parent as MasterData).id;
                ids.add(parentId);
                // Look up parent object to continue traversal
                curr = allMasterData.find(m => m.id === parentId);
            }
        };

        // 1. Process all assigned active KPIs
        masterData.forEach(processKpi);

        // 2. Process initialData KPI (in case editing an inactive one, we typically should allow it contextually)
        if (initialData && initialData.masterData) {
            // We need finding the full object for initialData kpi
            const kpi = allMasterData.find(m => m.id === initialData.masterData.id);
            if (kpi) processKpi(kpi);
        }

        return ids;
    }, [masterData, allMasterData, initialData]);


    // Derived Options - Now strictly filtered
    const indicatorOptions = useMemo(() => {
        const indicators = allMasterData.filter(m =>
            m.type === 'Sub-heading' && validAncestorIds.has(m.id)
        );
        return indicators.map(m => ({ id: m.id, label: m.title }));
    }, [allMasterData, validAncestorIds]);

    // Check if the selected Indicator has Data Headings as children
    const hasDataHeadings = useMemo(() => {
        if (!selectedIndicator) return false;
        const children = allMasterData.filter(m => m.parent?.id === selectedIndicator && validAncestorIds.has(m.id));
        return children.some(c => c.type === 'Data Heading');
    }, [selectedIndicator, allMasterData, validAncestorIds]);

    const dataHeadingOptions = useMemo(() => {
        if (!hasDataHeadings) return [];
        return allMasterData.filter(m =>
            m.parent?.id === selectedIndicator && m.type === 'Data Heading' && validAncestorIds.has(m.id)
        ).map(m => ({ id: m.id, label: m.title }));
    }, [selectedIndicator, hasDataHeadings, allMasterData, validAncestorIds]);


    // Determine which KPIs to render based on the lowest selected hierarchy level
    const renderKpis = useMemo(() => {
        // In Edit Mode, we only render the specific KPI being edited
        if (initialData && initialData.masterData) {
            const kpi = allMasterData.find(m => m.id === initialData.masterData.id);
            if (kpi) {
                // Return a combined object to match the expected structure
                return [{ ...kpi, assigned_unit: initialData.unit || kpi.assigned_unit || 'NA' } as any];
            }
            return [];
        }

        if (!initialData && !selectedIndicator) {
            return [];
        }

        let parentId = selectedDataHeading || selectedIndicator;
        if (!parentId) return [];

        const filtered = masterData.filter(k => {
            let curr: MasterData | undefined | null = k;
            while (curr && curr.parent) {
                const pId: number = (curr.parent as MasterData).id;
                if (pId === parentId) return true;
                curr = allMasterData.find(m => m.id === pId); // Traverse up to full object
            }
            return false;
        });

        // Initialize formData for newly rendered KPIs if they don't exist yet
        return filtered.map(kpi => kpi);
    }, [masterData, selectedDataHeading, selectedIndicator, initialData, allMasterData]);

    const groupedKpis = useMemo(() => {
        const groups: { id: number, title: string, kpis: any[] }[] = [];
        const noDataHeadingKpis: { kpi: any, subHeadingTitle: string }[] = [];

        renderKpis.forEach(kpi => {
            let curr: MasterData | undefined | null = kpi;
            let dataHeading: MasterData | null = null;
            let subHeadingContextName = '';

            while (curr && curr.parent) {
                const parentId = (curr.parent as MasterData).id;
                const fullParent = allMasterData.find(m => m.id === parentId);
                if (fullParent?.type === 'Data Heading') {
                    dataHeading = fullParent;
                }
                if (fullParent?.type === 'Sub-heading') {
                    subHeadingContextName = fullParent.title;
                }
                curr = fullParent;
            }

            if (dataHeading) {
                let group = groups.find(g => g.id === dataHeading!.id);
                if (!group) {
                    group = { id: dataHeading.id, title: dataHeading.title, kpis: [] };
                    groups.push(group);
                }
                group.kpis.push(kpi);
            } else {
                noDataHeadingKpis.push({ kpi, subHeadingTitle: subHeadingContextName });
            }
        });

        return { groups, noDataHeadingKpis };
    }, [renderKpis, allMasterData]);


    // Initialize empty form state for rendered KPIs, pre-filling with fetched entries if they exist
    useEffect(() => {
        if (initialData) return; // Keep existing edit data

        const dateObj = new Date(reportingDate);
        const currentMonthStr = `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}`;

        if (loadedMonth !== currentMonthStr) return;

        setFormData(prev => {
            const newFormData = { ...prev };
            let hasChanges = false;

            renderKpis.forEach(kpi => {
                const existingEntry = monthEntries.find(e => e.masterData?.id === kpi.id);
                const prevData = prev[kpi.id];

                if (existingEntry) {
                    if (!prevData || prevData.entryId !== existingEntry.id) {
                        newFormData[kpi.id] = {
                            kpiId: kpi.id,
                            entryId: existingEntry.id,
                            responseType: kpi.response_type || "Numeric",
                            value: existingEntry.value !== null && existingEntry.value !== undefined ? String(existingEntry.value) : '',
                            textValue: existingEntry.text_value || '',
                            unit: existingEntry.unit || kpi.assigned_unit || 'NA',
                            notes: existingEntry.notes || '',
                            evidencePath: existingEntry.evidence_path || ''
                        };
                        hasChanges = true;
                    }
                } else {
                    if (!prevData || prevData.entryId) {
                        newFormData[kpi.id] = {
                            kpiId: kpi.id,
                            responseType: kpi.response_type || "Numeric",
                            value: '',
                            textValue: '',
                            unit: kpi.assigned_unit || 'NA',
                            notes: '',
                            evidencePath: ''
                        };
                        hasChanges = true;
                    }
                }
            });

            return hasChanges ? newFormData : prev;
        });
    }, [renderKpis, monthEntries, loadedMonth, reportingDate, initialData]);


    const handleKpiInputChange = (kpiId: number, field: keyof KpiFormData, val: string) => {
        setFormData(prev => ({
            ...prev,
            [kpiId]: {
                ...prev[kpiId],
                [field]: val
            }
        }));
    };


    // Handlers
    const handleSubmit = async (submitStatus: string) => {
        if (renderKpis.length === 0) {
            toast.error("No KPIs selected or available for entry.");
            return;
        }

        // Collect valid entries from formData
        const validEntries: any[] = [];
        let hasValidationErrors = false;

        renderKpis.forEach(kpi => {
            const data = formData[kpi.id];
            if (!data) return;

            const hasNumericValue = data.responseType === "Numeric" && data.value.trim() !== '';
            const hasTextValue = data.responseType === "Text" && data.textValue.trim() !== '';

            // If user filled something for this KPI, validate and add to payload
            if (hasNumericValue || hasTextValue || data.notes.trim() !== '' || data.evidencePath.trim() !== '') {
                if (data.responseType === "Numeric" && !hasNumericValue) {
                    toast.error(`Please enter a numeric value for KPI: ${kpi.code}`);
                    hasValidationErrors = true;
                    return;
                }

                if (data.responseType === "Text" && !hasTextValue) {
                    toast.error(`Please enter a text response for KPI: ${kpi.code}`);
                    hasValidationErrors = true;
                    return;
                }

                validEntries.push({
                    kpiId: kpi.id,
                    entryId: data.entryId,
                    value: data.responseType === "Numeric" ? parseFloat(data.value) : null,
                    text_value: data.responseType === "Text" ? data.textValue : null,
                    unit: data.unit,
                    reportingDate,
                    status: submitStatus,
                    notes: data.notes,
                    evidence_path: data.evidencePath
                });
            }
        });

        if (hasValidationErrors) return;

        if (validEntries.length === 0) {
            toast.error("Please fill in data for at least one KPI before saving.");
            return;
        }

        setIsSubmitting(true);
        try {
            // Send either a single object (for Edit) or array (for Create Multiple)
            // The onSubmit handler in parent will need to handle arrays or we call it multiple times here.

            if (initialData) {
                // Editing a single entry
                await onSubmit(validEntries[0]);
            } else {
                // Creating multiple entries
                await onSubmit(validEntries); // We assume the parent supports an array
            }

            // Clear standard inputs (we could clear formData, but let's keep it in case they want to enter another month immediately, or maybe we should clear)
            if (!initialData) {
                setFormData({});
            }

            toast.success(initialData ? "Entry Updated Successfully!" : "Entries Saved Successfully!");
        } catch (error: any) {
            console.error("Submit Error:", error);
            const errorMessage = error.response?.data?.message || "Failed to submit entry.";
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };


    // Theme Styles
    const cardClass = isDark
        ? "bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-lg relative"
        : "bg-white border border-gray-200 rounded-xl p-8 shadow-md";

    const labelClass = isDark
        ? "text-slate-300 text-sm font-medium mb-1 block"
        : "text-gray-700 text-sm font-medium mb-1 block";

    const inputBgClass = isDark
        ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500"
        : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500 focus:border-blue-500";

    const inputClass = `w-full rounded-md px-3 py-2 border outline-none transition-all text-sm ${inputBgClass}`;

    return (
        <div className="max-w-6xl mx-auto">
            <div className={cardClass}>
                {allMasterData.length === 0 ? (
                    <div className="text-center p-10">
                        <p className={`text-lg font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No assigned data found for this site.</p>
                        <p className="text-sm text-gray-400 mt-2">Please contact your administrator to assign KPIs.</p>
                    </div>
                ) : (
                    <>
                        {/* Header & Global Settings */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-200 dark:border-slate-700 pb-4 relative z-20 gap-4">
                            <div>
                                <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{initialData ? 'Edit KPI Data' : 'Data Entry'}</h2>
                                <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>Select hierarchy to record KPI data.</p>
                            </div>

                            {/* Global Form Settings (Date and Status) */}
                            <div className="flex flex-col sm:flex-row flex-wrap gap-4 w-full md:w-auto p-4 rounded-lg bg-gray-50 dark:bg-slate-900/50 border border-gray-100 dark:border-slate-700/50">
                                <div className="flex-1 min-w-[200px]">
                                    <label className={labelClass}>Reporting Date</label>
                                    <div className="relative w-full">
                                        <input
                                            type="date"
                                            value={reportingDate}
                                            onChange={(e) => setReportingDate(e.target.value)}
                                            className={`${inputClass} appearance-none`}
                                        />
                                        <Calendar size={16} className={`absolute right-3 top-3.5 pointer-events-none ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-[200px]">
                                    <label className={labelClass}>Entry Status</label>
                                    <div className="w-full">
                                        <Dropdown
                                            options={statusOptions}
                                            value={status}
                                            onChange={(opt) => setStatus(opt?.id as string)}
                                            placeholder="Select Status..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-8 relative z-10">
                            {/* Hierarchy Selection - Only shown if Indicators exist! */}
                            {(indicatorOptions.length > 0 || hasDataHeadings) && (
                                <div className="space-y-4">
                                    <h3 className={`text-sm uppercase tracking-wider font-semibold mb-3 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>1. Filter by Heading</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                                        {indicatorOptions.length > 0 && (
                                            <div>
                                                <label className={labelClass}>Indicator (Sub-heading)</label>
                                                <Dropdown
                                                    options={indicatorOptions}
                                                    value={selectedIndicator}
                                                    onChange={(opt) => {
                                                        setSelectedIndicator(opt?.id ? Number(opt.id) : null);
                                                        setSelectedDataHeading(null);
                                                    }}
                                                    placeholder="All Indicators..."
                                                    disabled={!!initialData}
                                                />
                                            </div>
                                        )}

                                        {hasDataHeadings && (
                                            <div>
                                                <label className={labelClass}>Data Heading</label>
                                                <Dropdown
                                                    options={dataHeadingOptions}
                                                    value={selectedDataHeading}
                                                    onChange={(opt) => {
                                                        setSelectedDataHeading(opt?.id ? Number(opt.id) : null);
                                                    }}
                                                    placeholder="All Data Headings..."
                                                    disabled={!selectedIndicator || !!initialData}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Data Input List */}
                            <div className="space-y-4">
                                <h3 className={`text-sm uppercase tracking-wider font-semibold mb-3 flex items-center justify-between ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                    <span>2. Data Input</span>
                                    {renderKpis.length > 0 && (
                                        <span className="text-xs font-normal px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                            {renderKpis.length} KPIs Available
                                        </span>
                                    )}
                                </h3>

                                {renderKpis.length === 0 ? (
                                    <div className={`p-8 text-center rounded-lg border border-dashed ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-gray-300 bg-gray-50'}`}>
                                        <p className={isDark ? 'text-slate-400' : 'text-gray-500'}>
                                            {!selectedIndicator && !initialData
                                                ? "Please select an Indicator (Sub-heading) to view KPIs."
                                                : "No active KPIs found for the selected hierarchy."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {groupedKpis.groups.map((group) => (
                                            <div key={group.id} className={`p-5 rounded-lg border shadow-sm ${isDark ? 'bg-[#0f172a] border-slate-700' : 'bg-white border-gray-200'}`}>
                                                <h4 className={`text-xl font-bold mb-5 pb-3 border-b ${isDark ? 'text-white border-slate-700' : 'text-gray-900 border-gray-200'}`}>
                                                    {group.title}
                                                </h4>

                                                <div className="space-y-8">
                                                    {group.kpis.map((kpi, index) => {
                                                        const kpiData = formData[kpi.id] || { value: '', textValue: '', unit: kpi.assigned_unit || 'NA', notes: '', evidencePath: '', responseType: kpi.response_type || "Numeric" };
                                                        return (
                                                            <div key={kpi.id} className={`${index > 0 ? `pt-8 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}` : ''}`}>
                                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${isDark ? 'bg-slate-800 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>
                                                                                {kpi.code}
                                                                            </span>
                                                                        </div>
                                                                        <h5 className={`text-base font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>{kpi.title}</h5>
                                                                    </div>
                                                                    <div className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                                                                        <span className="opacity-70">Unit:</span> {kpiData.unit}
                                                                    </div>
                                                                </div>

                                                                {/* Form fields */}
                                                                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                                                                    <div className="md:col-span-12 lg:col-span-5">
                                                                        <label className={labelClass}>Company's Response <span className="text-red-500">*</span></label>
                                                                        {kpiData.responseType === "Numeric" ? (
                                                                            <input type="number" value={kpiData.value} onChange={(e) => handleKpiInputChange(kpi.id, 'value', e.target.value)} placeholder="0.00" className={inputClass} />
                                                                        ) : (
                                                                            <textarea rows={3} value={kpiData.textValue} onChange={(e) => handleKpiInputChange(kpi.id, 'textValue', e.target.value)} placeholder="Enter descriptive response..." className={`${inputClass} resize-none`}></textarea>
                                                                        )}
                                                                    </div>
                                                                    <div className="md:col-span-12 lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className={labelClass}>Supporting Evidence (Optional)</label>
                                                                            <input type="text" value={kpiData.evidencePath} onChange={(e) => handleKpiInputChange(kpi.id, 'evidencePath', e.target.value)} placeholder="URL or File Path" className={inputClass} />
                                                                        </div>
                                                                        <div>
                                                                            <label className={labelClass}>Additional Notes (Optional)</label>
                                                                            <input type="text" value={kpiData.notes} onChange={(e) => handleKpiInputChange(kpi.id, 'notes', e.target.value)} placeholder="Add context..." className={inputClass} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}

                                        {groupedKpis.noDataHeadingKpis.length > 0 && (
                                            <div className={`p-5 rounded-lg border shadow-sm ${isDark ? 'bg-[#0f172a] border-slate-700' : 'bg-white border-gray-200'}`}>
                                                <div className="space-y-8">
                                                    {groupedKpis.noDataHeadingKpis.map((item, index) => {
                                                        const { kpi, subHeadingTitle } = item;
                                                        const kpiData = formData[kpi.id] || { value: '', textValue: '', unit: kpi.assigned_unit || 'NA', notes: '', evidencePath: '', responseType: kpi.response_type || "Numeric" };
                                                        return (
                                                            <div key={kpi.id} className={`${index > 0 ? `pt-8 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'}` : ''}`}>
                                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${isDark ? 'bg-slate-800 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>
                                                                                {kpi.code}
                                                                            </span>
                                                                            {subHeadingTitle && (
                                                                                <span className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{subHeadingTitle}</span>
                                                                            )}
                                                                        </div>
                                                                        <h5 className={`text-base font-medium ${isDark ? 'text-slate-200' : 'text-gray-900'}`}>{kpi.title}</h5>
                                                                    </div>
                                                                    <div className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                                                                        <span className="opacity-70">Unit:</span> {kpiData.unit}
                                                                    </div>
                                                                </div>

                                                                {/* Form fields */}
                                                                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                                                                    <div className="md:col-span-12 lg:col-span-5">
                                                                        <label className={labelClass}>Company's Response <span className="text-red-500">*</span></label>
                                                                        {kpiData.responseType === "Numeric" ? (
                                                                            <input type="number" value={kpiData.value} onChange={(e) => handleKpiInputChange(kpi.id, 'value', e.target.value)} placeholder="0.00" className={inputClass} />
                                                                        ) : (
                                                                            <textarea rows={3} value={kpiData.textValue} onChange={(e) => handleKpiInputChange(kpi.id, 'textValue', e.target.value)} placeholder="Enter descriptive response..." className={`${inputClass} resize-none`}></textarea>
                                                                        )}
                                                                    </div>
                                                                    <div className="md:col-span-12 lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                        <div>
                                                                            <label className={labelClass}>Supporting Evidence (Optional)</label>
                                                                            <input type="text" value={kpiData.evidencePath} onChange={(e) => handleKpiInputChange(kpi.id, 'evidencePath', e.target.value)} placeholder="URL or File Path" className={inputClass} />
                                                                        </div>
                                                                        <div>
                                                                            <label className={labelClass}>Additional Notes (Optional)</label>
                                                                            <input type="text" value={kpiData.notes} onChange={(e) => handleKpiInputChange(kpi.id, 'notes', e.target.value)} placeholder="Add context..." className={inputClass} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-200 dark:border-slate-700">
                                <button
                                    onClick={onCancel}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isDark ? 'text-slate-300 hover:text-white hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={() => handleSubmit(status)}
                                    disabled={isSubmitting || renderKpis.length === 0}
                                    className={`px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-all flex items-center gap-2 ${isSubmitting || renderKpis.length === 0
                                        ? 'bg-blue-400 text-white cursor-not-allowed opacity-70'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                >
                                    {isSubmitting ? 'Saving...' : (initialData ? 'Save Changes' : 'Save All Entries')}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SingleDataEntryForm;
