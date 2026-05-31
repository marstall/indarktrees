'use client';

import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        onDismiss();
      }, 300); // Wait for fade-out animation
    }, 2000); // Auto-dismiss after 2 seconds

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 ${isExiting ? 'animate-toast-exit' : 'animate-toast-enter'}`}>
      <div className="bg-[#ffc] text-black px-4 py-2 w-full">
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs">🔔</span>
          <p className="text-xs">{message}</p>
        </div>
      </div>
    </div>
  );
}
