/**
 * ConfirmModal — Shared in-app confirmation dialog.
 * Replaces window.confirm() with a themed modal matching the app's design system.
 */

import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_CONFIG = {
  danger: {
    icon: ShieldAlert,
    iconColor: 'text-danger',
    confirmStyle: 'bg-danger hover:bg-red-600 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-warning',
    confirmStyle: 'bg-warning hover:bg-amber-600 text-white',
  },
  info: {
    icon: Info,
    iconColor: 'text-accent',
    confirmStyle: 'bg-accent hover:bg-accent-hover text-white',
  },
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-sf-surface border border-sf-border rounded-xl p-6 max-w-md w-full shadow-sf space-y-4 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-txt-primary flex items-center gap-2">
          <Icon className={config.iconColor} size={20} />
          <span>{title}</span>
        </h3>
        <p className="text-xs text-txt-secondary leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="sf-btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${config.confirmStyle}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
