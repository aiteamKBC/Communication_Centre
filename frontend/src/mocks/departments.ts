export interface Department {
  id: string;
  slug: string;
  name: string;
  head: string;
  headTitle: string;
  description: string;
  staffCount: number;
  openRisks: number;
  activeInitiatives: number;
  color: string;
  icon: string;
}

export const departments: Department[] = [
  {
    id: '1',
    slug: 'leadership',
    name: 'Leadership & Executive',
    head: 'Prof. David Kingsley',
    headTitle: 'Principal & CEO',
    description: 'Responsible for strategic direction, governance, and organisational performance across KBC.',
    staffCount: 8,
    openRisks: 2,
    activeInitiatives: 5,
    color: '#1B2A4A',
    icon: 'ri-government-line',
  },
  {
    id: '2',
    slug: 'hr',
    name: 'Human Resources',
    head: 'Helen Davies',
    headTitle: 'Director of People & Culture',
    description: 'Managing recruitment, staff development, wellbeing, payroll, and employment relations.',
    staffCount: 12,
    openRisks: 3,
    activeInitiatives: 4,
    color: '#0F7B6C',
    icon: 'ri-team-line',
  },
  {
    id: '3',
    slug: 'finance',
    name: 'Finance',
    head: 'Raj Patel',
    headTitle: 'Director of Finance',
    description: 'Budget management, financial reporting, procurement, audit, and ESFA funding compliance.',
    staffCount: 9,
    openRisks: 2,
    activeInitiatives: 3,
    color: '#107C10',
    icon: 'ri-funds-line',
  },
  {
    id: '4',
    slug: 'quality',
    name: 'Quality & Standards',
    head: 'Sarah Mitchell',
    headTitle: 'Head of Quality Assurance',
    description: 'Curriculum quality, Ofsted readiness, self-assessment, learner outcomes and performance data.',
    staffCount: 7,
    openRisks: 3,
    activeInitiatives: 4,
    color: '#D13438',
    icon: 'ri-award-line',
  },
  {
    id: '5',
    slug: 'marketing',
    name: 'Marketing & Partnerships',
    head: 'Lisa Thornton',
    headTitle: 'Head of Marketing',
    description: 'Brand management, student recruitment, employer engagement, and external communications.',
    staffCount: 6,
    openRisks: 2,
    activeInitiatives: 3,
    color: '#E06C00',
    icon: 'ri-megaphone-line',
  },
  {
    id: '6',
    slug: 'it',
    name: 'IT Services',
    head: 'Priya Sharma',
    headTitle: 'Head of Digital & IT',
    description: 'Infrastructure, MIS, software systems, cybersecurity, and staff technical support.',
    staffCount: 10,
    openRisks: 2,
    activeInitiatives: 4,
    color: '#0078D4',
    icon: 'ri-computer-line',
  },
  {
    id: '7',
    slug: 'operations',
    name: 'Operations & Estates',
    head: 'Mark Bridges',
    headTitle: 'Director of Operations',
    description: 'Campus facilities, health and safety, estates maintenance, events, and environmental sustainability.',
    staffCount: 15,
    openRisks: 2,
    activeInitiatives: 3,
    color: '#5C4D8A',
    icon: 'ri-building-2-line',
  },
  {
    id: '8',
    slug: 'compliance',
    name: 'Compliance & Risk',
    head: 'James Okonkwo',
    headTitle: 'Head of Compliance',
    description: 'GDPR, Prevent Duty, regulatory compliance, audit, risk register management, and policy governance.',
    staffCount: 5,
    openRisks: 4,
    activeInitiatives: 3,
    color: '#8B1538',
    icon: 'ri-shield-check-line',
  },
];
