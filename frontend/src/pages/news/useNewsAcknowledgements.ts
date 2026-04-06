import { useEffect, useState } from 'react';
import type { NewsItem } from '../../mocks/news';

const ACK_STORAGE_KEY = 'kbc-news-acknowledged';

type AcknowledgementMap = Record<string, boolean>;

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

function readAcknowledgements(): AcknowledgementMap {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as AcknowledgementMap : {};
  } catch {
    return {};
  }
}

function writeAcknowledgements(acknowledgements: AcknowledgementMap) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(acknowledgements));
}

export function useNewsAcknowledgements() {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<AcknowledgementMap>(() => readAcknowledgements());

  useEffect(() => {
    async function fetchNews() {
      try {
        setLoading(true);
        const response = await fetch('/api/news/');
        if (!response.ok) {
          throw new Error('Failed to load news.');
        }

        const payload = (await response.json()) as NewsItem[];
        setNewsItems(payload);
        setError(null);
      } catch {
        setError('Unable to load news from the database.');
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === ACK_STORAGE_KEY) {
        setAcknowledgements(readAcknowledgements());
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const items: NewsItem[] = newsItems.map(item => ({
    ...item,
    acknowledged: item.requiresAcknowledgement
      ? acknowledgements[item.id] ?? item.acknowledged ?? false
      : item.acknowledged,
  }));

  const toggleAcknowledgement = (id: string) => {
    setAcknowledgements(current => {
      const item = newsItems.find(newsItem => newsItem.id === id);
      const currentValue = current[id] ?? item?.acknowledged ?? false;
      const next = { ...current, [id]: !currentValue };
      writeAcknowledgements(next);
      return next;
    });
  };

  const addNews = async (payload: NewNewsPayload): Promise<void> => {
    const response = await fetch('/api/news/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

    if (!response.ok) {
      throw new Error('Failed to save news.');
    }

    const saved = (await response.json()) as NewsItem;
    setNewsItems(current => [saved, ...current]);
  };

  return { items, loading, error, toggleAcknowledgement, addNews };
}
