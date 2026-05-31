'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Toast } from './Toast';

interface NewContent {
  type: 'post' | 'comment';
  id: string;
  title: string;
  author: string;
}

export function NewContentPoller() {
  const [lastCheck, setLastCheck] = useState<Date>(new Date());
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/new-content?since=${lastCheck.toISOString()}`);
        const data = await response.json();

        if (data.newContent && data.newContent.length > 0) {
          const item = data.newContent[0]; // Show first new item

          if (item.type === 'post') {
            setToast(`New post by @${item.author}: ${item.title}`);
          } else {
            setToast(`New comment by @${item.author} on "${item.title}"`);
          }

          // Refresh the page to show new content
          router.refresh();
        }

        setLastCheck(new Date());
      } catch (error) {
        console.error('Failed to check for new content:', error);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, [lastCheck, router]);

  return toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null;
}
