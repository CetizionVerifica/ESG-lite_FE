import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { onboardCompany } from "../services/companyService";

const CompanyOnboardingPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        companyName: "",
        contactPerson: "",
        email: "",
        password: "",
        phoneNumber: "",
        industry: "",
        region: "",
        employeeRange: "",
        cinNumber: "",
        address: "",
        esgMitraAccess: false,
    });

    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [guidelineFile, setGuidelineFile] = useState<File | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;

        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const payload = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                // Only send the access flag when enabled (backend treats presence as true).
                if (key === "esgMitraAccess") {
                    if (value) payload.append(key, "true");
                    return;
                }
                payload.append(key, value as string);
            });
            if (logoFile) payload.append("logo", logoFile);
            if (guidelineFile) payload.append("colorGuideline", guidelineFile);

            await onboardCompany(payload);
            navigate("/companies"); // Navigate back to company list
        } catch (err: any) {
            console.error("Onboarding error:", err);
            setError(err.response?.data?.message || "Failed to onboard company");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Onboard New Company</h1>
                <button
                    onClick={() => navigate("/companies")}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                    Back
                </button>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {/* Company Details */}
                    <div className="md:col-span-2">
                        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Company Details</h2>
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Company Name *
                        </label>
                        <input
                            type="text"
                            name="companyName"
                            value={formData.companyName}
                            onChange={handleChange}
                            required
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Industry
                        </label>
                        <input
                            type="text"
                            name="industry"
                            value={formData.industry}
                            onChange={handleChange}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Region
                        </label>
                        <input
                            type="text"
                            name="region"
                            value={formData.region}
                            onChange={handleChange}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Employee Range
                        </label>
                        <select
                            name="employeeRange"
                            value={formData.employeeRange}
                            onChange={handleChange}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        >
                            <option value="">Select Range</option>
                            <option value="1-10">1-10</option>
                            <option value="11-50">11-50</option>
                            <option value="51-200">51-200</option>
                            <option value="201-500">201-500</option>
                            <option value="500+">500+</option>
                        </select>
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            CIN Number
                        </label>
                        <input
                            type="text"
                            name="cinNumber"
                            value={formData.cinNumber}
                            onChange={handleChange}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Address
                        </label>
                        <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    {/* Admin User Details */}
                    <div className="md:col-span-2 mt-4">
                        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Admin User Details</h2>
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Contact Person Name *
                        </label>
                        <input
                            type="text"
                            name="contactPerson"
                            value={formData.contactPerson}
                            onChange={handleChange}
                            required
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Email *
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Password *
                        </label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            minLength={6}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Phone Number
                        </label>
                        <input
                            type="tel"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                        />
                    </div>

                    {/* Access Control */}
                    <div className="md:col-span-2 mt-4">
                        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Access Control</h2>
                    </div>

                    <div className="md:col-span-2 mb-6">
                        <label className="flex items-center space-x-3">
                            <input
                                type="checkbox"
                                name="esgMitraAccess"
                                checked={formData.esgMitraAccess}
                                onChange={handleChange}
                                className="form-checkbox h-5 w-5 text-blue-600"
                            />
                            <span className="text-gray-700 font-medium">Grant ESG-Mitra Access</span>
                        </label>
                    </div>

                    {/* Branding */}
                    <div className="md:col-span-2 mt-4">
                        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Branding</h2>
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Company Logo
                        </label>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-gray-700"
                        />
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG, WEBP or SVG. Max 10MB.</p>
                    </div>

                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Color Guideline
                        </label>
                        <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg,image/webp,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            onChange={(e) => setGuidelineFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-gray-700"
                        />
                        <p className="text-xs text-gray-500 mt-1">PDF, image, Word, or Excel with the brand color guideline. Max 10MB.</p>
                    </div>
                </div>

                <div className="flex items-center justify-end mt-6">
                    <button
                        type="submit"
                        disabled={loading}
                        className={`px-6 py-2 rounded text-white font-bold ${loading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                            }`}
                    >
                        {loading ? "Onboarding..." : "Onboard Company"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CompanyOnboardingPage;
