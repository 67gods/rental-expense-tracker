import { SegLinks } from '@/components/ui';

/**
 * The four things you can record, as one strip.
 *
 * Picking the wrong one is common - you open "expense" and realise the thing
 * you actually want to log is the drive. Without this the only way back is the
 * browser button or a return trip through /log, and a capture flow that
 * punishes a wrong first tap is a capture flow people stop using.
 *
 * The job rides along, because switching record type inside a job must not
 * silently drop you out of it.
 */
export function CaptureTabs({
  current,
  jobId = null,
}: {
  current: 'expense' | 'time' | 'trip' | 'income';
  jobId?: string | null;
}) {
  const suffix = jobId ? `?job=${jobId}` : '';
  return (
    <SegLinks
      current={current}
      items={[
        { key: 'expense', label: 'Expense', href: `/log/expense${suffix}` },
        { key: 'time', label: 'Time', href: `/log/time${suffix}` },
        { key: 'trip', label: 'Trip', href: `/log/trip${suffix}` },
        // Rent has no job to belong to - it is money in, not work done.
        { key: 'income', label: 'Rent', href: '/log/income' },
      ]}
    />
  );
}
