import { ReactNode } from "react"

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    children: ReactNode
    className?: string
}

const Modal = ({ isOpen, onClose, title, children, className = "" }: ModalProps) => {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="fixed inset-0 bg-black/50"
                onClick={onClose}
            />
            <div className={`relative bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col ${className}`}>
                <div className="flex justify-between items-center mb-4">
                    {title && <h2 className="text-xl font-semibold">{title}</h2>}
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>
                <div className="overflow-y-auto">{children}</div>
            </div>
        </div>
    )
}

export default Modal