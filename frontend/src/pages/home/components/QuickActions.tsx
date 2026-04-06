import { Link } from 'react-router-dom';

const actions = [
  {
    label: 'Policies & Guides',
    icon: 'ri-file-list-3-line',
    path: '/documents',
    bgColor: 'bg-kbc-navy',
    textColor: 'text-white',
    hoverColor: 'hover:bg-kbc-navy-light',
  },
  {
    label: 'Report a Risk',
    icon: 'ri-error-warning-line',
    path: '/risk-register',
    bgColor: 'bg-kbc-red',
    textColor: 'text-white',
    hoverColor: 'hover:opacity-90',
  },
  {
    label: 'IT Help Desk',
    icon: 'ri-computer-line',
    path: '/departments/it',
    bgColor: 'bg-kbc-navy-soft',
    textColor: 'text-white',
    hoverColor: 'hover:bg-kbc-navy-mid',
  },
  {
    label: 'Project Hub',
    icon: 'ri-folder-chart-line',
    path: '/dashboard',
    bgColor: 'bg-kbc-amber',
    textColor: 'text-kbc-navy',
    hoverColor: 'hover:opacity-90',
  },
  {
    label: 'Training Plan',
    icon: 'ri-calendar-todo-line',
    path: '/training-plan',
    bgColor: 'bg-kbc-green',
    textColor: 'text-white',
    hoverColor: 'hover:opacity-90',
  },
];

export default function QuickActions() {
  return (
    <section className="w-full px-4 md:px-6 pb-4">
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-kbc-navy">Quick Links</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className={`inline-flex items-center gap-2 ${action.bgColor} ${action.textColor} ${action.hoverColor} font-semibold text-sm px-4 py-2.5 rounded-lg cursor-pointer transition-all hover:-translate-y-px whitespace-nowrap`}
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
