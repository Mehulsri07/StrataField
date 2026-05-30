/**
 * ToastContainer — Global notification overlay.
 * Displays temporary toast messages in the corner of the screen.
 */

import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { useUIStore, Toast } from '@/stores/uiStore';
import { AnimatePresence, motion } from 'framer-motion';

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="text-success" size={16} />;
      case 'error':   return <AlertCircle className="text-danger" size={16} />;
      case 'warning': return <AlertTriangle className="text-warning" size={16} />;
      case 'info':    return <Info className="text-info" size={16} />;
    }
  };

  const getBorderColor = (type: Toast['type']) => {
    switch (type) {
      case 'success': return 'border-success/30';
      case 'error':   return 'border-danger/30';
      case 'warning': return 'border-warning/30';
      case 'info':    return 'border-info/30';
    }
  };

  return (
    <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className={`
              pointer-events-auto flex items-start gap-3 p-3.5
              bg-sf-surface border rounded-lg shadow-sf-lg
              ${getBorderColor(toast.type)}
            `}
          >
            <div className="flex-shrink-0 mt-0.5">{getIcon(toast.type)}</div>
            <div className="flex-1 text-sm text-txt-primary leading-tight font-medium">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-txt-muted hover:text-txt-secondary p-0.5 rounded transition-all cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
export default ToastContainer;
