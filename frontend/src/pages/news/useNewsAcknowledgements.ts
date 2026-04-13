import { useEffect, useState } from 'react';
import type { NewsItem } from '../../mocks/news';

export interface NewNewsPayload {
  title: string;
  date: string;
  category: string;
  summary: string;
  content: string;
  imageUrl: string;
  audience: string;
  priority: 'critical' | 'important' | 'general';
}

export function useNewsAcknowledgements() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNews() {
      try {
        setLoading(true);
        const response = await fetch('/api/news/');
        if (!response.ok) throw new Error('Failed to load news.');
        const payload = (await response.json()) as NewsItem[];
        setItems(payload);
        setError(null);
      } catch {
        setError('Unable to load news from the database.');
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
  }, []);

  const toggleAcknowledgement = async (id: string) => {
    // Optimistic update
    setItems(current =>
      current.map(item =>
        item.id === id ? { ...item, acknowledged: !item.acknowledged } : item,
      ),
    );

    try {
      const response = await fetch(`/api/news/${id}/acknowledge/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to save acknowledgement.');
      const updated = (await response.json()) as NewsItem;
      // Sync with server's confirmed value
      setItems(current =>
        current.map(item => (item.id === id ? { ...item, acknowledged: updated.acknowledged } : item)),
      );
    } catch {
      // Revert optimistic update on failure
      setItems(current =>
        current.map(item =>
          item.id === id ? { ...item, acknowledged: !item.acknowledged } : item,
        ),
      );
    }
  };

  const addNews = async (payload: NewNewsPayload): Promise<void> => {
    const response = await fetch('/api/news/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        publicationDate: payload.date || undefined,
        category: payload.category,
        summary: payload.summary,
        content: payload.content,
        details: payload.content || payload.summary,
        imageUrl: payload.imageUrl,
        audience: payload.audience,
        priority: payload.priority,
      }),
    });

    if (!response.ok) throw new Error('Failed to save news.');
    const saved = (await response.json()) as NewsItem;
    setItems(current => [saved, ...current]);
  };

  return { items, loading, error, toggleAcknowledgement, addNews };
}
