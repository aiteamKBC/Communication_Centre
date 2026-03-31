import { Link } from 'react-router-dom';

export default function PrioritySnapshot() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-kbc-navy">Internal Dashboard</h3>
        <Link to="/dashboard" className="text-xs text-kbc-navy hover:underline cursor-pointer whitespace-nowrap">
          Full view &rsaquo;
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center py-10 px-6 gap-4">
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-kbc-navy/5">
          <i className="ri-dashboard-3-line text-kbc-navy text-2xl" />
        </div>
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-kbc-amber bg-amber-50 border border-amber-200 px-3 py-1 rounded-full mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-kbc-amber animate-pulse inline-block" />
            In Development
          </span>
          <p className="text-sm font-bold text-kbc-navy mt-1">Coming Soon</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">The Internal Dashboard is currently being built and will be available shortly.</p>
        </div>
        <Link
          to="/dashboard"
          className="text-xs text-kbc-navy font-medium hover:underline cursor-pointer flex items-center gap-1"
        >
          View Internal Dashboard &rsaquo;
        </Link>
      </div>
    </div>
  );
}
