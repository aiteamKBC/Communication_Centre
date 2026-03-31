import { useEffect, useState } from 'react';
import { newsItems, type NewsItem } from '../../mocks/news';

const ACK_STORAGE_KEY = 'kbc-news-acknowledged';

type AcknowledgementMap = Record<string, boolean>;

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
  const [acknowledgements, setAcknowledgements] = useState<AcknowledgementMap>(() => readAcknowledgements());

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

  return { items, toggleAcknowledgement };
}
