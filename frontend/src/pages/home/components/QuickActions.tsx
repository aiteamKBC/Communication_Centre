import { Link } from 'react-router-dom';

const actions = [
  {
    label: 'Policies & Guides',
    icon: 'ri-file-list-3-line',
    path: '/documents',
    bgColor: 'bg-kbc-navy',
    textColor: 'text-white',
  },
  {
    label: 'Report a Risk',
    icon: 'ri-error-warning-line',
    path: '/risk-register',
    bgColor: 'bg-kbc-red',
    textColor: 'text-white',
  },
  {
    label: 'IT Help Desk',
    icon: 'ri-computer-line',
    path: '/departments/it',
    bgColor: 'bg-kbc-navy-light',
    textColor: 'text-white',
  },
  {
    label: 'Project Hub',
    icon: 'ri-folder-chart-line',
    path: '/dashboard',
    bgColor: 'bg-kbc-navy-mid',
    textColor: 'text-white',
  },
  {
    label: 'Training Plan',
    icon: 'ri-calendar-todo-line',
    path: '/training-plan',
    bgColor: 'bg-kbc-amber',
    textColor: 'text-kbc-navy',
  },
];

export default function QuickActions() {
  return (
    <section className="w-full px-4 md:px-6 pb-4">
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-kbc-navy">Quick Links</h2>
          <div className="flex items-center gap-1">
            <button className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer rounded border border-gray-200 hover:border-kbc-navy transition-colors">
              <i className="ri-arrow-left-s-line text-sm" />
            </button>
            <button className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-kbc-navy cursor-pointer rounded border border-gray-200 hover:border-kbc-navy transition-colors">
              <i className="ri-arrow-right-s-line text-sm" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className={`inline-flex items-center gap-2 ${action.bgColor} ${action.textColor} font-semibold text-sm px-4 py-2.5 rounded cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap`}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <i className={`${action.icon} text-sm`} />
              </div>
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
