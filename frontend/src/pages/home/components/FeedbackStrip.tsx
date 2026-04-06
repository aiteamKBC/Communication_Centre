import { useState } from 'react';
import { Link } from 'react-router-dom';
import FeedbackModal from '../../feedback/components/FeedbackModal';

export default function FeedbackStrip() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="w-full bg-gray-50 border-t border-gray-200 py-8 px-6 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-kbc-navy text-base">Have feedback or a concern?</h3>
            <p className="text-gray-500 text-sm mt-0.5">Help us improve this platform and raise any issues with your team.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/feedback"
              className="text-kbc-navy border border-kbc-navy text-sm font-semibold px-5 py-2.5 rounded hover:bg-kbc-navy hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              View All Feedback
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="bg-kbc-navy text-white text-sm font-semibold px-5 py-2.5 rounded hover:bg-kbc-navy-light transition-colors cursor-pointer whitespace-nowrap"
            >
              Submit Feedback
            </button>
          </div>
        </div>
      </section>

      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
