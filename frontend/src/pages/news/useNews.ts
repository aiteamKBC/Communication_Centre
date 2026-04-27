import { useEffect, useState } from 'react';
import type { NewsItem } from '../../mocks/news';

export interface NewNewsPayload {
  title: string;
  date: string;
  category: string;
  summary: string;
  content: string;
  priority: 'critical' | 'important' | 'general';
}

export interface UpdateNewsPayload extends NewNewsPayload {
  id: string;
}

export function useNews(initialItems?: NewsItem[]) {
  const [items, setItems] = useState<NewsItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState(initialItems === undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialItems !== undefined) {
      setItems(initialItems);
      setLoading(false);
      setError(null);
      return;
    }

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

    void fetchNews();
  }, [initialItems]);

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
        priority: payload.priority,
      }),
    });

    if (!response.ok) throw new Error('Failed to save news.');
    const saved = (await response.json()) as NewsItem;
    setItems(current => [saved, ...current]);
  };

  const updateNews = async (payload: UpdateNewsPayload): Promise<void> => {
    const response = await fetch(`/api/news/${payload.id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        publicationDate: payload.date || undefined,
        category: payload.category,
        summary: payload.summary,
        content: payload.content,
        details: payload.content || payload.summary,
        priority: payload.priority,
      }),
    });

    if (!response.ok) throw new Error('Failed to update news.');
    const updated = (await response.json()) as NewsItem;
    setItems(current => current.map(item => (item.id === updated.id ? updated : item)));
  };

  const deleteNews = async (id: string): Promise<void> => {
    const response = await fetch(`/api/news/${id}/`, {
      method: 'DELETE',
    });

    if (!response.ok) throw new Error('Failed to delete news.');
    setItems(current => current.filter(item => item.id !== id));
  };

  return { items, loading, error, addNews, updateNews, deleteNews };
}
