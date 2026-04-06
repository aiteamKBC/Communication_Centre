export interface Cohort {
  id: string;
  name: string;
  programme: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'upcoming' | 'completed';
  learnerCount: number;
  trainer: string;
  department: string;
  deliveryMode: 'blended' | 'online' | 'in-person';
  progress: number;
}

export interface CohortSession {
  id: string;
  cohortId: string;
  title: string;
  date: string;
  time: string;
  trainer: string;
  deliveryMode: 'online' | 'in-person' | 'hybrid';
  location: string;
  type: 'live-session' | 'workshop' | 'assessment' | 'review' | 'induction';
  status: 'scheduled' | 'completed' | 'cancelled';
  description: string;
}

export interface ProgrammeComponent {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  duration: string;
  type: string;
  activities: string[];
}

export const cohorts: Cohort[] = [
  {
    id: 'c1',
    name: 'Cohort A — Spring 2026',
    programme: 'Business Administration Level 3',
    startDate: '10 Jan 2026',
    endDate: '30 Jun 2026',
    status: 'active',
    learnerCount: 22,
    trainer: 'Emma Whitfield',
    department: 'Quality & Standards',
    deliveryMode: 'blended',
    progress: 65,
  },
  {
    id: 'c2',
    name: 'Cohort B — Spring 2026',
    programme: 'Digital Marketing Level 4',
    startDate: '17 Jan 2026',
    endDate: '17 Jul 2026',
    status: 'active',
    learnerCount: 18,
    trainer: 'Olivia Barnes',
    department: 'Marketing',
    deliveryMode: 'online',
    progress: 48,
  },
  {
    id: 'c3',
    name: 'Cohort C — Foundation Skills 2026',
    programme: 'Team Leading Level 2',
    startDate: '3 Feb 2026',
    endDate: '30 Sep 2026',
    status: 'active',
    learnerCount: 14,
    trainer: 'James Hartley',
    department: 'HR',
    deliveryMode: 'in-person',
    progress: 35,
  },
  {
    id: 'c4',
    name: 'Cohort D — Summer 2026',
    programme: 'Project Management Level 4',
    startDate: '1 May 2026',
    endDate: '30 Nov 2026',
    status: 'upcoming',
    learnerCount: 20,
    trainer: 'Ryan Chen',
    department: 'IT Services',
    deliveryMode: 'blended',
    progress: 0,
  },
  {
    id: 'c5',
    name: 'Cohort E — Autumn 2025',
    programme: 'Customer Service Level 3',
    startDate: '5 Sep 2025',
    endDate: '28 Feb 2026',
    status: 'completed',
    learnerCount: 16,
    trainer: 'Louise Grant',
    department: 'HR',
    deliveryMode: 'blended',
    progress: 100,
  },
];

export const sessions: CohortSession[] = [
  {
    id: 's1',
    cohortId: 'c1',
    title: 'Induction Day — Welcome to KBC Apprenticeships',
    date: '10 Jan 2026',
    time: '09:00–16:00',
    trainer: 'Emma Whitfield',
    deliveryMode: 'in-person',
    location: 'Main Conference Room, KBC Campus',
    type: 'induction',
    status: 'completed',
    description: 'Welcome session covering programme overview, expectations, team introductions, and IT systems onboarding.',
  },
  {
    id: 's2',
    cohortId: 'c1',
    title: 'Module 1: Communication in the Workplace',
    date: '17 Jan 2026',
    time: '10:00–13:00',
    trainer: 'Emma Whitfield',
    deliveryMode: 'hybrid',
    location: 'Training Room 2 / Teams',
    type: 'live-session',
    status: 'completed',
    description: 'Exploring professional communication, written and verbal techniques, email etiquette, and reporting structures.',
  },
  {
    id: 's3',
    cohortId: 'c1',
    title: 'Workshop: Business Administration Processes',
    date: '31 Jan 2026',
    time: '09:30–15:00',
    trainer: 'Emma Whitfield',
    deliveryMode: 'in-person',
    location: 'Training Room 2',
    type: 'workshop',
    status: 'completed',
    description: 'Practical workshop on document management, business correspondence, and administrative workflows.',
  },
  {
    id: 's4',
    cohortId: 'c1',
    title: 'Module 2: Organisational Culture & Values',
    date: '14 Feb 2026',
    time: '10:00–13:00',
    trainer: 'Emma Whitfield',
    deliveryMode: 'online',
    location: 'Microsoft Teams',
    type: 'live-session',
    status: 'completed',
    description: 'Understanding workplace values, equality and diversity, professional behaviours, and ethical decision making.',
  },
  {
    id: 's5',
    cohortId: 'c1',
    title: 'Progress Review — Checkpoint 1',
    date: '7 Mar 2026',
    time: '13:00–15:00',
    trainer: 'Emma Whitfield',
    deliveryMode: 'in-person',
    location: 'Tutor Room 4',
    type: 'review',
    status: 'completed',
    description: 'One-to-one progress review. Learners present portfolio evidence and discuss targets with trainer and employer representative.',
  },
  {
    id: 's6',
    cohortId: 'c1',
    title: 'Module 3: Project Planning & Coordination',
    date: '4 Apr 2026',
    time: '10:00–13:00',
    trainer: 'Emma Whitfield',
    deliveryMode: 'hybrid',
    location: 'Training Room 2 / Teams',
    type: 'live-session',
    status: 'scheduled',
    description: 'Introduction to project planning tools, task management, stakeholder communication, and risk identification.',
  },
  {
    id: 's7',
    cohortId: 'c1',
    title: 'Assessment Preparation Workshop',
    date: '9 May 2026',
    time: '09:30–15:30',
    trainer: 'Emma Whitfield',
    deliveryMode: 'in-person',
    location: 'Training Room 2',
    type: 'assessment',
    status: 'scheduled',
    description: 'End-point assessment preparation. Portfolio review, mock interview practice, and structured guidance on EPA format and expectations.',
  },
  {
    id: 's8',
    cohortId: 'c2',
    title: 'Induction — Digital Marketing Programme Welcome',
    date: '17 Jan 2026',
    time: '10:00–15:00',
    trainer: 'Olivia Barnes',
    deliveryMode: 'online',
    location: 'Microsoft Teams',
    type: 'induction',
    status: 'completed',
    description: 'Online welcome session for Cohort B. Programme structure, digital tools setup, introductions, and learning expectations.',
  },
  {
    id: 's9',
    cohortId: 'c2',
    title: 'Module 1: Digital Marketing Fundamentals',
    date: '31 Jan 2026',
    time: '10:00–13:00',
    trainer: 'Olivia Barnes',
    deliveryMode: 'online',
    location: 'Microsoft Teams',
    type: 'live-session',
    status: 'completed',
    description: 'Covering digital channels, audience targeting, content strategy, SEO basics, and analytics fundamentals.',
  },
  {
    id: 's10',
    cohortId: 'c2',
    title: 'Workshop: Social Media Campaign Planning',
    date: '21 Feb 2026',
    time: '09:00–14:00',
    trainer: 'Olivia Barnes',
    deliveryMode: 'hybrid',
    location: 'Studio Suite / Teams',
    type: 'workshop',
    status: 'completed',
    description: 'Hands-on campaign planning workshop. Learners build a social media campaign brief using real employer briefs as case studies.',
  },
  {
    id: 's11',
    cohortId: 'c2',
    title: 'Progress Review — Checkpoint 1',
    date: '14 Mar 2026',
    time: '14:00–16:30',
    trainer: 'Olivia Barnes',
    deliveryMode: 'online',
    location: 'Microsoft Teams',
    type: 'review',
    status: 'completed',
    description: 'Online progress review with employer present. Discussion of portfolio evidence, targets, and next learning objectives.',
  },
  {
    id: 's12',
    cohortId: 'c3',
    title: 'Induction — Team Leading Welcome Session',
    date: '3 Feb 2026',
    time: '09:00–15:00',
    trainer: 'James Hartley',
    deliveryMode: 'in-person',
    location: 'Training Room 1',
    type: 'induction',
    status: 'completed',
    description: 'Programme launch for Cohort C. Understanding leadership roles, team dynamics, employer expectations, and learning commitments.',
  },
];

export const programmeComponents: ProgrammeComponent[] = [
  {
    id: 'pc1',
    title: 'Onboarding & Welcome',
    description: 'Learners are welcomed to the programme with an introduction to KBC, their trainer, and their employer expectations. All accounts, systems, and programme tools are set up.',
    icon: 'ri-door-open-line',
    color: '#1B2A4A',
    duration: '1 day',
    type: 'Administrative',
    activities: ['Platform registration', 'Meet your trainer', 'Employer introduction', 'Learner agreement sign-off'],
  },
  {
    id: 'pc2',
    title: 'Induction Programme',
    description: 'A structured induction covering KBC policies, health and safety, safeguarding awareness, and an overview of the full learning journey ahead.',
    icon: 'ri-information-line',
    color: '#107C10',
    duration: '1–2 days',
    type: 'Foundation',
    activities: ['Safeguarding awareness', 'Health & safety briefing', 'Equality & diversity overview', 'Programme structure walkthrough'],
  },
  {
    id: 'pc3',
    title: 'Live Learning Sessions',
    description: 'Regular tutor-led sessions covering core knowledge and skills modules. Delivered via Microsoft Teams or in-person depending on cohort. Typically fortnightly.',
    icon: 'ri-video-line',
    color: '#0078D4',
    duration: '3 hours per session',
    type: 'Delivery',
    activities: ['Knowledge module delivery', 'Q&A and discussion', 'Group activities', 'Case study analysis'],
  },
  {
    id: 'pc4',
    title: 'Practical Workshops',
    description: 'Hands-on workshops designed to apply knowledge in practical workplace scenarios. Includes role-play, group tasks, and employer-led activities.',
    icon: 'ri-tools-line',
    color: '#E06C00',
    duration: 'Half to full day',
    type: 'Applied Learning',
    activities: ['Practical scenario exercises', 'Portfolio evidence gathering', 'Team challenges', 'Employer collaboration tasks'],
  },
  {
    id: 'pc5',
    title: 'Portfolio Development',
    description: 'Learners build an ongoing portfolio of evidence that demonstrates occupational competence. Evidence is linked to KSBs (Knowledge, Skills, and Behaviours).',
    icon: 'ri-folder-3-line',
    color: '#5C4D8A',
    duration: 'Ongoing throughout programme',
    type: 'Assessment',
    activities: ['Evidence mapping to KSBs', 'Work product submissions', 'Reflective accounts', 'Professional discussions'],
  },
  {
    id: 'pc6',
    title: 'Progress Reviews',
    description: 'Scheduled review meetings between the learner, trainer, and employer. Reviews assess progress, update action plans, and ensure the programme remains on track.',
    icon: 'ri-user-star-line',
    color: '#D13438',
    duration: '60–90 minutes per review',
    type: 'Review',
    activities: ['Progress against plan', 'Target setting', '3-way feedback', 'Risk and support identification'],
  },
  {
    id: 'pc7',
    title: 'Learning Materials',
    description: 'Access to a comprehensive digital resource library including reading materials, videos, workbooks, and interactive quizzes via the learning portal.',
    icon: 'ri-book-2-line',
    color: '#0F7B6C',
    duration: 'Self-paced access',
    type: 'Resources',
    activities: ['Online modules', 'Video library access', 'Downloadable workbooks', 'Knowledge checks and quizzes'],
  },
  {
    id: 'pc8',
    title: 'End-Point Assessment Prep',
    description: 'Dedicated preparation for End-Point Assessment (EPA). Learners receive guidance on interview technique, portfolio presentation, and assessment criteria.',
    icon: 'ri-award-line',
    color: '#F7A800',
    duration: '1–2 days',
    type: 'Assessment Preparation',
    activities: ['EPA format briefing', 'Mock interviews', 'Portfolio review', 'Employer sign-off confirmation'],
  },
];
