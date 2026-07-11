export function PageHeader({
  title,
  titleAttr,
  subtitle,
  subtitleAttr,
  actions,
}: {
  title: string;
  titleAttr?: string;
  subtitle?: React.ReactNode;
  subtitleAttr?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-semibold tracking-tight text-gray-900" title={titleAttr}>
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1 truncate text-sm text-gray-500" title={subtitleAttr}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
