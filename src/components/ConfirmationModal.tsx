import { ReactNode } from "react";
import Modal from "./Modal";

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message: string | ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
    isDark?: boolean;
}

const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Action",
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    isDanger = false,
    isDark = false,
}: ConfirmationModalProps) => {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            className="max-w-md" // Small width override
            isDark={isDark}
        >
            <div className={`mb-6 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                {message}
            </div>
            <div className="flex justify-end gap-3">
                <button
                    onClick={onClose}
                    className={`px-4 py-2 rounded transition-colors ${isDark
                        ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        : "text-gray-700 bg-gray-100 hover:bg-gray-200"
                        }`}
                >
                    {cancelLabel}
                </button>
                <button
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                    className={`px-4 py-2 text-white rounded transition-colors ${isDanger
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-blue-600 hover:bg-blue-700"
                        }`}
                >
                    {confirmLabel}
                </button>
            </div>
        </Modal>
    );
};

export default ConfirmationModal;
