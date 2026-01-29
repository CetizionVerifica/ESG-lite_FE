import { useState, useEffect } from "react";
import api from "../api/axios";

interface Site {
  site_id: number;
  name: string;
}

interface Category {
  category_id: number;
  category_name: string;
}

interface UploadResult {
  message: string;
  summary: {
    totalRows: number;
    emissionsCreated: number;
    emissionsSkipped: number;
    usersCreated: number;
    createdUsers: string[];
    site: { id: number; name: string };
    category: { id: number; name: string };
    defaultPassword?: string;
  };
}

const UploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [siteName, setSiteName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useExistingSite, setUseExistingSite] = useState(true);
  const [useExistingCategory, setUseExistingCategory] = useState(true);

  useEffect(() => {
    loadDropdownData();
  }, []);

  const loadDropdownData = async () => {
    try {
      const [sitesRes, categoriesRes] = await Promise.all([
        api.get("/admin/upload/sites"),
        api.get("/admin/upload/categories"),
      ]);
      setSites(sitesRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      console.error("Error loading dropdown data:", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please select an Excel file");
      return;
    }

    if (!siteName.trim()) {
      setError("Please enter or select a site name");
      return;
    }

    if (!categoryName.trim()) {
      setError("Please enter or select a category name");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("siteName", siteName.trim());
      formData.append("categoryName", categoryName.trim());

      const response = await api.post("/admin/upload/emissions", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setResult(response.data);
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      // Reload dropdown data in case new site/category was created
      loadDropdownData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Upload Emission Data</h1>
        <p className="text-gray-600 mt-1">
          Upload an Excel file to import emission data and create users
        </p>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Excel File
            </label>
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {/* Site Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Site
            </label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={useExistingSite}
                  onChange={() => setUseExistingSite(true)}
                  className="mr-2"
                />
                Existing Site
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!useExistingSite}
                  onChange={() => setUseExistingSite(false)}
                  className="mr-2"
                />
                New Site
              </label>
            </div>
            {useExistingSite ? (
              <select
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a site</option>
                {sites.map((site) => (
                  <option key={site.site_id} value={site.name}>
                    {site.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Enter new site name"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Category Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={useExistingCategory}
                  onChange={() => setUseExistingCategory(true)}
                  className="mr-2"
                />
                Existing Category
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!useExistingCategory}
                  onChange={() => setUseExistingCategory(false)}
                  className="mr-2"
                />
                New Category
              </label>
            </div>
            {useExistingCategory ? (
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.category_id} value={cat.category_name}>
                    {cat.category_name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Enter new category name"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !file}
            className={`w-full py-2 px-4 rounded font-medium ${
              loading || !file
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loading ? "Uploading..." : "Upload and Process"}
          </button>
        </form>

        {/* Result Display */}
        {result && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-4">
              Upload Successful
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Total Rows:</span>{" "}
                {result.summary.totalRows}
              </p>
              <p>
                <span className="font-medium">Emissions Created:</span>{" "}
                {result.summary.emissionsCreated}
              </p>
              <p>
                <span className="font-medium">Emissions Skipped:</span>{" "}
                {result.summary.emissionsSkipped}
              </p>
              <p>
                <span className="font-medium">Site:</span>{" "}
                {result.summary.site.name} (ID: {result.summary.site.id})
              </p>
              <p>
                <span className="font-medium">Category:</span>{" "}
                {result.summary.category.name} (ID: {result.summary.category.id})
              </p>
              {result.summary.usersCreated > 0 && (
                <>
                  <hr className="my-3" />
                  <p>
                    <span className="font-medium">Users Created:</span>{" "}
                    {result.summary.usersCreated}
                  </p>
                  <p>
                    <span className="font-medium">User Emails:</span>{" "}
                    {result.summary.createdUsers.join(", ")}
                  </p>
                  <p className="text-orange-600">
                    <span className="font-medium">Default Password:</span>{" "}
                    {result.summary.defaultPassword}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-3">Expected Excel Format</h3>
          <p className="text-sm text-gray-600 mb-3">
            The Excel file should have the following columns:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
            <li><strong>year</strong> - Year (e.g., 2025)</li>
            <li><strong>month</strong> - Month name (e.g., January)</li>
            <li><strong>equipment</strong> - Equipment type</li>
            <li><strong>fuelState</strong> - Fuel state (e.g., Gas, Liquid)</li>
            <li><strong>fuelType</strong> - Fuel type (e.g., Natural Gas)</li>
            <li><strong>unit</strong> - Unit of measurement</li>
            <li><strong>activity</strong> - Activity value</li>
            <li><strong>emissionFactor</strong> - Emission factor value</li>
            <li><strong>emissionFactorUnit</strong> - Emission factor unit</li>
            <li><strong>calculatedEmission</strong> - Total emission (tCO2e)</li>
            <li><strong>approved</strong> - "true" or "false"</li>
            <li><strong>email</strong> - User email (optional, creates user)</li>
            <li><strong>name</strong> - User name (optional)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
