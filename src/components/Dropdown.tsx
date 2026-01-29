import { useState, useRef, useEffect } from "react";

export interface DropdownOption {
  id: string | number;
  label: string;
  [key: string]: any;
}

export interface DropdownProps {
  options: DropdownOption[];
  placeholder?: string;
  value?: string | number | null;
  onChange?: (option: DropdownOption) => void;
  disabled?: boolean;
  clearable?: boolean;
  searchable?: boolean;
  className?: string;
  labelKey?: string;
  valueKey?: string;
  multiple?: boolean;
  onMultipleChange?: (options: DropdownOption[]) => void;
  multipleValue?: (string | number)[];
}

const Dropdown = ({
  options,
  placeholder = "Select an option",
  value = null,
  onChange,
  disabled = false,
  clearable = true,
  searchable = false,
  className = "",
  labelKey = "label",
  valueKey = "id",
  multiple = false,
  onMultipleChange,
  multipleValue = [],
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Single select logic
  const selectedOption = !multiple
    ? options.find((opt) => {
        const optValue = opt[valueKey as keyof DropdownOption] ?? opt.id;
        return optValue === value;
      })
    : null;

  // Multiple select logic
  const selectedOptions = multiple
    ? options.filter((opt) => {
        const optValue = opt[valueKey as keyof DropdownOption] ?? opt.id;
        return multipleValue.includes(optValue as string | number);
      })
    : [];

  const filteredOptions = searchable
    ? options.filter((opt) => {
        const labelValue = opt[labelKey as keyof DropdownOption];
        if (labelValue === undefined || labelValue === null) return false;
        return String(labelValue)
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      })
    : options;

  const handleSelect = (option: DropdownOption) => {
    if (multiple) {
      const optValue = option[valueKey as keyof DropdownOption] ?? option.id;
      const newValues = multipleValue.includes(optValue as string | number)
        ? multipleValue.filter((v) => v !== optValue)
        : [...multipleValue, optValue as string | number];
      onMultipleChange?.(
        options.filter((opt) => {
          const val = opt[valueKey as keyof DropdownOption] ?? opt.id;
          return newValues.includes(val as string | number);
        }),
      );
    } else {
      onChange?.(option);
      setIsOpen(false);
      setSearchTerm("");
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (multiple) {
      onMultipleChange?.([]);
    } else {
      onChange?.(null as any);
    }
    setSearchTerm("");
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative w-full ${className}`}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full border px-4 py-2 rounded text-left flex justify-between items-center transition min-h-10.5] ${
          disabled
            ? "bg-gray-100 text-gray-500 cursor-not-allowed"
            : "bg-white hover:border-blue-500 focus:outline-none focus:ring focus:ring-blue-300"
        } ${isOpen ? "border-blue-500" : "border-gray-300"}`}
      >
        <div className="flex flex-wrap gap-2 flex-1">
          {multiple && selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <span
                key={String(opt[valueKey as keyof DropdownOption] ?? opt.id)}
                className="bg-blue-200 text-blue-900 px-2 py-1 rounded text-sm flex items-center gap-1"
              >
                {String(opt[labelKey as keyof DropdownOption])}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(opt);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelect(opt);
                    }
                  }}
                  className="text-blue-700 hover:text-blue-900 cursor-pointer font-bold"
                >
                  ✕
                </div>
              </span>
            ))
          ) : !multiple && selectedOption ? (
            <span className="text-gray-900">
              {String(selectedOption[labelKey as keyof DropdownOption])}
            </span>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-2 pointer-events-none ml-2">
          {clearable && (selectedOption || selectedOptions.length > 0) && (
            <div
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 text-sm cursor-pointer pointer-events-auto"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleClear(e as any);
                }
              }}
            >
              ✕
            </div>
          )}
          <svg
            className={`w-4 h-4 transition-transform shrink-0 ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50">
          {/* Search Input */}
          {searchable && (
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring focus:ring-blue-300"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const optValue =
                  option[valueKey as keyof DropdownOption] ?? option.id;
                const isSelected = multiple
                  ? multipleValue.includes(optValue as string | number)
                  : selectedOption &&
                    (selectedOption[valueKey as keyof DropdownOption] ??
                      selectedOption.id) === optValue;
                return (
                  <button
                    key={String(optValue)}
                    onClick={() => handleSelect(option)}
                    type="button"
                    className={`w-full text-left px-4 py-2 hover:bg-blue-100 transition flex items-center gap-2 ${
                      isSelected
                        ? "bg-blue-200 text-blue-900 font-semibold"
                        : "text-gray-900"
                    }`}
                  >
                    {multiple && (
                      <input
                        type="checkbox"
                        checked={isSelected || false}
                        onChange={() => {}}
                        className="w-4 h-4"
                      />
                    )}
                    {String(option[labelKey as keyof DropdownOption])}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-2 text-gray-500 text-sm">
                No options found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;
