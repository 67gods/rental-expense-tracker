import Link from 'next/link';

/**
 * Shown above a capture form that was opened from "+ Add related".
 *
 * The form itself gains no field - the job travels as a hidden value - so this
 * strip is the only thing that tells the owner where the record is going. It is
 * context, not a control: there is nothing to fill in and nothing to decide.
 */
export function JobBanner({ title, jobId }: { title: string; jobId: string }) {
  return (
    <div className="card card-pad mb-3">
      <p style={{fontWeight:500}}>Adding to “{title}”</p>
      <p className="hint">
        This will join the other records in that job. Nothing on the form below changes.
      </p>
      <Link href={`/jobs/${jobId}`} className="btn btn-ghost mt-2 text-xs">
        See what is in it
      </Link>
    </div>
  );
}
