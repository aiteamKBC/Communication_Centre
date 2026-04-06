export interface Initiative {
  id: string;
  initiative: string;
  owner: string;
  department: string;
  deadline: string;
  status: 'on-track' | 'at-risk' | 'delayed';
  lastUpdated: string;
  progress: number;
}

export const initiatives: Initiative[] = [
  {
    id: '1',
    initiative: 'Ofsted Self-Assessment Report (SAR) 2025–26',
    owner: 'Sarah Mitchell',
    department: 'Quality & Standards',
    deadline: '15 Apr 2026',
    status: 'at-risk',
    lastUpdated: '28 Mar 2026',
    progress: 65,
  },
  {
    id: '2',
    initiative: 'GDPR Compliance Review & Staff Training Rollout',
    owner: 'James Okonkwo',
    department: 'Compliance',
    deadline: '5 Apr 2026',
    status: 'delayed',
    lastUpdated: '29 Mar 2026',
    progress: 40,
  },
  {
    id: '3',
    initiative: 'Digital Transformation — MIS System Upgrade',
    owner: 'Priya Sharma',
    department: 'IT Services',
    deadline: '30 Jun 2026',
    status: 'on-track',
    lastUpdated: '25 Mar 2026',
    progress: 52,
  },
  {
    id: '4',
    initiative: 'Staff Wellbeing & Mental Health Action Plan',
    owner: 'Helen Davies',
    department: 'HR',
    deadline: '31 May 2026',
    status: 'on-track',
    lastUpdated: '22 Mar 2026',
    progress: 78,
  },
  {
    id: '5',
    initiative: 'New Curriculum Framework — T-Level Expansion',
    owner: 'Dr. Paul Adeyemi',
    department: 'Academic Services',
    deadline: '1 Sep 2026',
    status: 'on-track',
    lastUpdated: '20 Mar 2026',
    progress: 35,
  },
  {
    id: '6',
    initiative: 'Employer Partnerships & Work Placement Programme',
    owner: 'Lisa Thornton',
    department: 'Marketing',
    deadline: '30 Apr 2026',
    status: 'at-risk',
    lastUpdated: '27 Mar 2026',
    progress: 55,
  },
  {
    id: '7',
    initiative: 'Carbon Net-Zero Estates Improvement Plan',
    owner: 'Mark Bridges',
    department: 'Estates',
    deadline: '31 Dec 2026',
    status: 'on-track',
    lastUpdated: '15 Mar 2026',
    progress: 20,
  },
  {
    id: '8',
    initiative: 'Prevent Duty & Safeguarding Framework Update',
    owner: 'Amara Bello',
    department: 'HR & Safeguarding',
    deadline: '30 Apr 2026',
    status: 'delayed',
    lastUpdated: '29 Mar 2026',
    progress: 30,
  },
];
