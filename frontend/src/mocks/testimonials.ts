export interface Testimonial {
  id: string;
  name: string;
  role: string;
  organisation: string;
  quote: string;
  rating: number;
  avatar: string;
  type: 'learner' | 'employer' | 'staff';
}

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'Aisha Patel',
    role: 'Apprentice — Business Administration L3',
    organisation: 'Kent County Council',
    quote: 'The KBC programme completely changed how I approach my work. My trainer Emma was incredibly supportive, and the workshops gave me real-world skills I use every single day. I genuinely feel more confident and capable in my role.',
    rating: 5,
    avatar: 'AP',
    type: 'learner',
  },
  {
    id: 't2',
    name: 'Marcus Thompson',
    role: 'Line Manager & Employer Partner',
    organisation: 'Medway NHS Foundation Trust',
    quote: 'We\'ve worked with KBC for three cohort cycles now. The quality of learners coming through is outstanding, and the progress review process keeps us fully informed. It\'s a real partnership — not just a training provider.',
    rating: 5,
    avatar: 'MT',
    type: 'employer',
  },
  {
    id: 't3',
    name: 'Sophie Crawford',
    role: 'Apprentice — Digital Marketing L4',
    organisation: 'Creative Agency, Maidstone',
    quote: 'I was nervous about balancing work and study, but KBC made it completely manageable. The online sessions fit around my job and the learning materials are excellent. I already got a promotion halfway through the programme!',
    rating: 5,
    avatar: 'SC',
    type: 'learner',
  },
  {
    id: 't4',
    name: 'Darren Hughes',
    role: 'Operations Director',
    organisation: 'Hughes Logistics Ltd',
    quote: 'The Team Leading cohort has had a visible impact on our supervisory team\'s performance. KBC\'s approach is professional, flexible, and genuinely outcome-focused. We\'ve already enrolled our next group of emerging managers.',
    rating: 5,
    avatar: 'DH',
    type: 'employer',
  },
  {
    id: 't5',
    name: 'Naomi Okafor',
    role: 'Cohort Graduate — Customer Service L3',
    organisation: 'Hastings Direct Insurance',
    quote: 'Completing this qualification gave me the confidence to step into a team leader role. KBC\'s trainers genuinely care about your progress and celebrate every achievement. The best decision I\'ve made for my career.',
    rating: 5,
    avatar: 'NO',
    type: 'learner',
  },
  {
    id: 't6',
    name: 'James Hartley',
    role: 'Assessor & Trainer',
    organisation: 'KBC Communication Centre',
    quote: 'Working at KBC means working with a team that truly values quality and learner outcomes. The systems and resources available to trainers here are second to none, and there\'s a genuine culture of continuous improvement.',
    rating: 5,
    avatar: 'JH',
    type: 'staff',
  },
];
