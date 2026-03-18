import { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative ${width} w-full bg-card border border-border rounded-lg shadow-2xl animate-fade-in flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]`}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>
  );
}
