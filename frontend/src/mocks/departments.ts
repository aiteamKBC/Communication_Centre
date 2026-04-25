export interface Department {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
}

export const departments: Department[] = [
  {
    id: '7',
    slug: 'director',
    name: 'Director',
    color: '#1B2A4A',
    icon: 'ri-government-line',
  },
  {
    id: '1',
    slug: 'tech-ai',
    name: 'Tech and AI',
    color: '#0078D4',
    icon: 'ri-cpu-line',
  },
  {
    id: '2',
    slug: 'enrollment',
    name: 'Enrollment',
    color: '#0F7B6C',
    icon: 'ri-user-add-line',
  },
  {
    id: '3',
    slug: 'coaches',
    name: 'Coaches',
    color: '#5C4D8A',
    icon: 'ri-team-line',
  },
  {
    id: '4',
    slug: 'data',
    name: 'Data',
    color: '#E06C00',
    icon: 'ri-database-2-line',
  },
  {
    id: '5',
    slug: 'quality-assurance',
    name: 'Quality Assurance',
    color: '#D13438',
    icon: 'ri-award-line',
  },
  {
    id: '6',
    slug: 'marketing',
    name: 'Marketing',
    color: '#107C10',
    icon: 'ri-megaphone-line',
  },
];
