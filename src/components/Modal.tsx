import { ReactNode } from "react"

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    children: ReactNode
    className?: string
    isDark?: boolean
}

const Modal = ({ isOpen, onClose, title, children, className = "", isDark = false }: ModalProps) => {
    if (!isOpen) return null

    const containerClass = isDark
        ? "relative bg-slate-800 rounded-lg shadow-lg shadow-slate-900/50 p-6 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col border border-slate-700"
        : "relative bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col"

    const titleClass = isDark
        ? "text-xl font-semibold text-slate-100"
        : "text-xl font-semibold"

    const closeButtonClass = isDark
        ? "text-slate-400 hover:text-slate-200 text-2xl leading-none"
        : "text-gray-500 hover:text-gray-700 text-2xl leading-none"

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="fixed inset-0 bg-black/50"
                onClick={onClose}
            />
            <div className={`${containerClass} ${className}`}>
                <div className="flex justify-between items-center mb-4">
                    {title && <h2 className={titleClass}>{title}</h2>}
                    <button
                        onClick={onClose}
                        className={closeButtonClass}
                    >
                        &times;
                    </button>
                </div>
                <div className="overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400">{children}</div>
            </div>
        </div>
    )
}

export default Modal