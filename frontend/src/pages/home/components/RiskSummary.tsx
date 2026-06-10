import { Link } from 'react-router-dom';

export default function RiskSummary() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-kbc-navy">Ofsted Risk Register</h3>
        <Link to="/risk-register#ofsted-risk-register" className="text-xs text-kbc-navy hover:underline">
          Register &rsaquo;
        </Link>
      </div>

      <div className="px-4 py-8 text-center text-gray-400">
        <i className="ri-list-check-3 mb-2 block text-3xl text-gray-300" />
        <p className="text-xs font-semibold">No Ofsted Risk Register yet</p>
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
        <Link
          to="/risk-register#ofsted-risk-register"
          className="flex items-center justify-center gap-1 text-xs font-medium text-kbc-navy hover:underline"
        >
          View Ofsted Risk Register &rsaquo;
        </Link>
      </div>
    </div>
  );
}
