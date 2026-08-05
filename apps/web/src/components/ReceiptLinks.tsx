/**
 * The two things anyone wants from a receipt already on file: look at it, or
 * get a copy.
 *
 * Both point at the app rather than at S3. The bucket is private, so the only
 * usable URL is a signed one, and a signed URL rendered into the page starts
 * expiring the moment the page is served. The redirect signs on the click.
 */
export function ReceiptLinks({ receiptKey }: { receiptKey: string }) {
  const href = `/api/v1/receipts/view?key=${encodeURIComponent(receiptKey)}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>On file</span>
      <a className="linkbtn" href={href} target="_blank" rel="noreferrer">
        View
      </a>
      <span className="muted" aria-hidden="true">
        ·
      </span>
      {/*
        No `download` attribute: it is ignored cross-origin, and this href
        redirects to S3. The `download=1` parameter is what actually sets
        Content-Disposition on the response.
      */}
      <a className="linkbtn" href={`${href}&download=1`}>
        Download
      </a>
    </span>
  );
}
