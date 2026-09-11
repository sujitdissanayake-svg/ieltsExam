import type { ReactNode } from "react";

export function DashboardCard({
  title,
  action,
  className,
  children
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}
