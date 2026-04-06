import { useState } from 'react';
import { testimonials } from '../../../mocks/testimonials';

const typeFilter = [
  { key: 'all', label: 'All' },
  { key: 'learner', label: 'Learners' },
  { key: 'employer', label: 'Employers' },
  { key: 'staff', label: 'Staff' },
];

const typeColors: Record<string, string> = {
  learner: 'bg-green-50 text-kbc-green',
  employer: 'bg-kbc-navy/10 text-kbc-navy',
  staff: 'bg-yellow-50 text-yellow-700',
};

export default function TestimonialsSection() {
  const [active, setActive] = useState<string>('all');

  const filtered = active === 'all' ? testimonials.slice(0, 3) : testimonials.filter(t => t.type === active).slice(0, 3);

  return (
    <section className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-kbc-navy">What Our Learners Say</h2>
          <p className="text-gray-400 text-xs mt-0.5">Real feedback from learners, employers, and staff across our programmes</p>
        </div>
        <div className="flex items-center gap-1 px-1 py-1 bg-gray-100 rounded-full">
          {typeFilter.map(f => (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all ${active === f.key ? 'bg-white text-kbc-navy shadow-sm' : 'text-gray-500 hover:text-kbc-navy'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => (
          <div
            key={t.id}
            className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col"
          >
            {/* Quote icon */}
            <div className="w-8 h-8 flex items-center justify-center mb-3">
              <i className="ri-double-quotes-l text-2xl text-kbc-amber" />
            </div>

            {/* Stars */}
            <div className="flex items-center gap-0.5 mb-3">
              {Array.from({ length: t.rating }).map((_, i) => (
                <i key={i} className="ri-star-fill text-kbc-amber text-sm" />
              ))}
            </div>

            {/* Quote text */}
            <p className="text-xs text-gray-600 leading-relaxed flex-1 italic">
              &ldquo;{t.quote}&rdquo;
            </p>

            {/* Author */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-50">
              <div className="w-9 h-9 rounded-full bg-kbc-navy flex items-center justify-center shrink-0">
                <span className="text-kbc-amber font-bold text-xs">{t.avatar}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-kbc-navy truncate">{t.name}</p>
                <p className="text-xs text-gray-400 truncate">{t.role}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${typeColors[t.type]}`}>
                {t.type}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
