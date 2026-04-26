export interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  audience: string;
  department: string;
  priority: 'critical' | 'important' | 'general';
  date: string;
  publicationDate?: string;
  status?: string;
  requiresAcknowledgement: boolean;
  isExpired: boolean;
  acknowledged?: boolean;
  image?: string;
  imageUrl?: string;
  category?: string;
  author?: string;
  content?: string;
}

export const newsItems: NewsItem[] = [];
