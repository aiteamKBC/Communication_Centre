import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function HeroSection() {
  const [leadershipOpen, setLeadershipOpen] = useState(false);

  return (
    <>
      <section className="w-full px-4 md:px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Panel 1 — Alert / Important Notice */}
          <div className="bg-kbc-red rounded-lg p-5 flex flex-col justify-between min-h-[160px]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 flex items-center justify-center shrink-0 bg-white/20 rounded-lg">
                <i className="ri-alarm-warning-line text-white text-xl" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-snug mb-1">
                  IMPORTANT: Compliance Audit Due 30<sup>th</sup> April
                </p>
                <p className="text-white/80 text-xs leading-relaxed">
                  Review required documents ASAP!
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Link
                to="/documents"
                className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                View Details
                <i className="ri-arrow-right-s-line text-sm" />
              </Link>
            </div>
          </div>

          {/* Panel 2 — Message from the Principal */}
          <div className="relative rounded-lg overflow-hidden min-h-[160px] cursor-pointer group" onClick={() => setLeadershipOpen(true)}>
            <img
              src="https://readdy.ai/api/search-image?query=confident%20mature%20British%20college%20principal%20in%20smart%20suit%20standing%20in%20modern%20bright%20office%2C%20warm%20professional%20smile%2C%20university%20setting%20with%20books%20and%20certificates%20visible%2C%20natural%20window%20light&width=600&height=340&seq=hero-principal-panel&orientation=landscape"
              alt="Message from Principal"
              className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-kbc-navy/90 via-kbc-navy/40 to-transparent" />
            <div className="relative z-10 p-5 h-full flex flex-col justify-end">
              <p className="text-white/80 text-xs font-medium mb-1">Message from the Principal</p>
              <h3 className="text-white font-bold text-base leading-snug">
                Building Our Future Together!
              </h3>
              <p className="text-white/70 text-xs mt-1">Click to read the full message &rarr;</p>
            </div>
          </div>

          {/* Panel 3 — Campaign / Learning */}
          <div className="relative rounded-lg overflow-hidden min-h-[160px]">
            <img
              src="https://readdy.ai/api/search-image?query=spring%20learning%20campaign%20education%20college%20background%2C%20light%20blue%20and%20white%20tones%2C%20graduation%20mortarboard%20cap%20and%20flowers%20on%20clean%20minimal%20desk%2C%20academic%20achievement%20symbols%2C%20fresh%20bright%20professional%20educational%20setting&width=600&height=340&seq=hero-campaign-panel&orientation=landscape"
              alt="Spring Learning Campaign"
              className="absolute inset-0 w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-kbc-navy/80 via-transparent to-transparent" />
            <div className="absolute top-0 right-0 bottom-0 left-0 bg-kbc-navy/25" />
            <div className="relative z-10 p-5 h-full flex flex-col justify-between">
              <div>
                <h3 className="text-white font-bold text-base leading-snug drop-shadow-sm">
                  Spring Learning Campaign
                </h3>
                <p className="text-white/80 text-xs mt-1">New Workshops &amp; Courses</p>
              </div>
              <div>
                <Link
                  to="/training-plan"
                  className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Learn More
                  <i className="ri-arrow-right-s-line text-sm" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Principal Modal */}
      {leadershipOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setLeadershipOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-5">
              <img
                src="https://readdy.ai/api/search-image?query=professional%20mature%20British%20academic%20college%20principal%20headshot%2C%20formal%20dark%20suit%2C%20neutral%20clean%20light%20grey%20studio%20background%2C%20confident%20warm%20friendly%20smile%2C%20high%20quality%20corporate%20portrait%20photography&width=120&height=120&seq=principal-kbc-001&orientation=squarish"
                alt="Principal"
                className="w-16 h-16 rounded-full object-cover object-top border-2 border-kbc-navy shrink-0"
              />
              <div>
                <h3 className="font-bold text-kbc-navy text-base">Prof. David Kingsley</h3>
                <p className="text-gray-500 text-xs">Principal &amp; CEO, Kent Business College</p>
                <p className="text-gray-400 text-xs mt-0.5">29 March 2026</p>
              </div>
            </div>
            <p className="text-gray-700 text-sm leading-relaxed mb-3">
              Dear colleagues, as we enter the final term of this academic year, I want to acknowledge the outstanding commitment our staff have shown in the face of significant regulatory change and operational pressure.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed mb-3">
              Our Ofsted readiness work is progressing well, and I am encouraged by the engagement from every department. Our GDPR training completion must reach 100% by 5 April — please prioritise this.
            </p>
            <p className="text-gray-700 text-sm leading-relaxed mb-5">
              This platform is your central resource for all updates, deadlines, and priorities. Use it daily. Together, we will deliver an outstanding outcome for our students and community.
            </p>
            <button
              onClick={() => setLeadershipOpen(false)}
              className="w-full bg-kbc-navy text-white font-semibold text-sm py-2.5 rounded cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
