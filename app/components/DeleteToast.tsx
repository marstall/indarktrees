'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from './Toast';

interface DeleteToastProps {
  deletedTitle: string | null;
}

export function DeleteToast({ deletedTitle }: DeleteToastProps) {
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (deletedTitle) {
      setToast(`Post deleted: "${deletedTitle}"`);
      router.replace('/');
    }
  }, [deletedTitle, router]);

  if (!toast) return null;

  return <Toast message={toast} onDismiss={() => setToast(null)} />;
}
