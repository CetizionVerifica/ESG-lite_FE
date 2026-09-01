import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

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
  const { isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  // Recalculate menu position when opened; close on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const updatePos = () => {
      if (dropdownRef.current) {
        const rect = dropdownRef.current.getBoundingClientRect();
        const menuHeight = 260; // approximate max menu height
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUpward = spaceBelow < menuHeight && rect.top > menuHeight;

        setMenuPos({
          top: openUpward ? rect.top - menuHeight - 4 : rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };
    updatePos();

    const handleScroll = (e: Event) => {
      // Don't close if the scroll is inside the dropdown menu itself (options list)
      if (menuRef.current?.contains(e.target as Node)) return;
      // Multi-select: keep open (just reposition) so ticking an option — which
      // reflows the page — doesn't close it. User closes via outside-click/toggle.
      if (multiple) {
        updatePos();
        return;
      }
      setIsOpen(false);
    };
    // Capture phase so we catch scrolls on any ancestor (e.g. modal overflow container)
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [isOpen, multiple]);

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

  // Close dropdown when clicking outside (check both trigger and portal menu)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Theme-aware classes
  const buttonBaseClass = "w-full border px-4 py-2 rounded text-left flex justify-between items-center transition min-h-[42px]";
  const buttonClass = isDark
    ? `${buttonBaseClass} ${
        disabled
          ? "bg-slate-700 text-slate-500 cursor-not-allowed border-slate-600"
          : "bg-slate-800 border-slate-600 hover:border-blue-500 focus:outline-none focus:ring focus:ring-blue-500/30"
      } ${isOpen ? "border-blue-500" : ""}`
    : `${buttonBaseClass} ${
        disabled
          ? "bg-gray-100 text-gray-500 cursor-not-allowed"
          : "bg-white hover:border-blue-500 focus:outline-none focus:ring focus:ring-blue-300"
      } ${isOpen ? "border-blue-500" : "border-gray-300"}`;

  const menuClass = isDark
    ? "bg-slate-800 border border-slate-600 rounded shadow-lg shadow-slate-900/50"
    : "bg-white border border-gray-300 rounded shadow-lg";

  const searchInputClass = isDark
    ? "w-full border border-slate-600 bg-slate-700 text-slate-200 px-3 py-2 rounded text-sm focus:outline-none focus:ring focus:ring-blue-500/30 placeholder-slate-400"
    : "w-full border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring focus:ring-blue-300";

  const getOptionClass = (isSelected: boolean) =>
    isDark
      ? `w-full text-left px-4 py-2 hover:bg-slate-700 transition flex items-center gap-2 ${
          isSelected ? "bg-blue-600/30 text-blue-300 font-semibold" : "text-slate-200"
        }`
      : `w-full text-left px-4 py-2 hover:bg-blue-100 transition flex items-center gap-2 ${
          isSelected ? "bg-blue-200 text-blue-900 font-semibold" : "text-gray-900"
        }`;

  const tagClass = isDark
    ? "bg-blue-600/30 text-blue-300 px-2 py-1 rounded text-sm flex items-center gap-1"
    : "bg-blue-200 text-blue-900 px-2 py-1 rounded text-sm flex items-center gap-1";

  const tagRemoveClass = isDark
    ? "text-blue-400 hover:text-blue-200 cursor-pointer font-bold"
    : "text-blue-700 hover:text-blue-900 cursor-pointer font-bold";

  const textClass = isDark ? "text-slate-200" : "text-gray-900";
  const placeholderClass = isDark ? "text-slate-400" : "text-gray-500";
  const clearClass = isDark
    ? "text-slate-400 hover:text-slate-200 text-sm cursor-pointer pointer-events-auto"
    : "text-gray-400 hover:text-gray-600 text-sm cursor-pointer pointer-events-auto";
  const emptyClass = isDark ? "px-4 py-2 text-slate-500 text-sm" : "px-4 py-2 text-gray-500 text-sm";
  const borderClass = isDark ? "border-b border-slate-700" : "border-b border-gray-200";
  const iconClass = isDark ? "text-slate-400" : "text-gray-500";

  return (
    <div ref={dropdownRef} className={`relative w-full ${className}`}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={buttonClass}
      >
        <div className="flex flex-wrap gap-2 flex-1">
          {multiple && selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <span
                key={String(opt[valueKey as keyof DropdownOption] ?? opt.id)}
                className={tagClass}
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
                  className={tagRemoveClass}
                >
                  ✕
                </div>
              </span>
            ))
          ) : !multiple && selectedOption ? (
            <span className={textClass}>
              {String(selectedOption[labelKey as keyof DropdownOption])}
            </span>
          ) : (
            <span className={placeholderClass}>{placeholder}</span>
          )}
        </div>
        {/* pointer-events-none keeps the chevron from stealing clicks from the
            trigger, but the ✕ needs to receive its own click — so it re-enables
            pointer events on itself via pointer-events-auto. */}
        <div className="flex items-center gap-2 pointer-events-none ml-2">
          {clearable && (selectedOption || selectedOptions.length > 0) && (
            <div
              onClick={handleClear}
              className={`${clearClass} pointer-events-auto`}
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
            className={`w-4 h-4 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""} ${iconClass}`}
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

      {/* Dropdown Menu — rendered via portal to escape overflow containers */}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className={menuClass}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 9999,
          }}
        >
          {/* Search Input */}
          {searchable && (
            <div className={`p-2 ${borderClass}`}>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={searchInputClass}
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
                    className={getOptionClass(isSelected || false)}
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
              <div className={emptyClass}>
                No options found
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Dropdown;
