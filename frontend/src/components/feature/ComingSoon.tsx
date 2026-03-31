import { Link } from 'react-router-dom';

interface ComingSoonProps {
  title: string;
  icon: string;
  breadcrumb: string;
}

export default function ComingSoon({ title, icon, breadcrumb }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <Link to="/" className="hover:text-kbc-navy cursor-pointer">Home</Link>
            <span>/</span>
            <span className="text-kbc-navy font-medium">{breadcrumb}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-kbc-navy rounded flex items-center justify-center shrink-0">
              <i className={`${icon} text-white text-base`} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-kbc-navy">{title}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="text-center max-w-md">
          {/* Crest */}
          <div className="flex items-center justify-center mb-8">
            <img
              src="https://public.readdy.ai/ai/img_res/01e44241-379a-48b6-aa59-f959ef3e728e.png"
              alt="KBC Crest"
              className="w-24 h-24 object-contain opacity-30"
            />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-kbc-navy/10 text-kbc-navy text-xs font-semibold px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-kbc-amber animate-pulse inline-block" />
            In Development
          </div>

          <h2 className="text-2xl font-bold text-kbc-navy mb-3">{title}</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            This section is currently being built and will be available soon. We're working hard to bring you a great experience here.
          </p>

          {/* Progress bar */}
          <div className="bg-gray-200 rounded-full h-1.5 w-64 mx-auto mb-8">
            <div className="bg-kbc-navy h-1.5 rounded-full" style={{ width: '35%' }} />
          </div>

          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-kbc-navy text-white text-sm font-semibold px-6 py-3 rounded-lg cursor-pointer hover:bg-kbc-navy-light transition-colors whitespace-nowrap"
          >
            <i className="ri-arrow-left-line text-sm" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
