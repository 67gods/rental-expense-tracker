/**
 * The bar at the top of the content well.
 *
 * Title, an optional clarifying crumb, and the actions for this page. It is
 * sticky because the actions on a long table need to stay reachable - scrolling
 * to the bottom of eighty expenses to find "Export" is the kind of small
 * friction that adds up to not using the app.
 */
export function PageHeader({
  title,
  crumb,
  actions,
}: {
  title: string;
  crumb?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="topbar">
      <h1>{title}</h1>
      {crumb ? <span className="topbar-crumb">{crumb}</span> : null}
      {actions ? <div className="topbar-actions">{actions}</div> : null}
    </header>
  );
}
