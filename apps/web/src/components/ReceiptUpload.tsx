'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'uploading' | 'reading' | 'done' | 'error';

/** Confidence the model reported for one figure it read. */
export type ExtractionConfidence = 'high' | 'medium' | 'low';

/** What the reader found. Mirrors the payload from /api/v1/receipts/extract. */
export interface ExtractedReceipt {
  vendor: string;
  date: string;
  amountCents: number;
  scheduleECategory: string;
  contractorName: string | null;
  notes: string;
  confidence: {
    vendor: ExtractionConfidence;
    date: ExtractionConfidence;
    amount: ExtractionConfidence;
  };
}

export interface DuplicateMatch {
  id: string;
  date: string;
  vendor: string;
  amountCents: number;
  propertyId: string | null;
  kind: 'exact' | 'likely';
}

export type ExtractionOutcome =
  | { status: 'extracted'; extracted: ExtractedReceipt }
  | { status: 'not_receipt' }
  | {
      status: 'skipped';
      reason: 'heic' | 'unsupported' | 'not_configured' | 'unreadable' | 'duplicate' | 'not_requested';
    };

export interface ReceiptRead {
  sha256: string;
  extraction: ExtractionOutcome;
  duplicate: DuplicateMatch | null;
}

/**
 * Receipt capture, and the pane that shows what was captured.
 *
 * `capture="environment"` opens the rear camera straight from the form on a
 * phone, so photographing a receipt at the counter is one tap rather than a
 * trip through the gallery.
 *
 * The file goes directly to S3 with a presigned URL. Routing a 10MB photo
 * through a serverless function to reach a bucket adds a timeout risk and buys
 * nothing.
 *
 * Once it lands, the app reads it back and asks what it says. That second step
 * is deliberately not allowed to hold anything up: the receipt is already
 * stored and the form is already usable, so a reader that is slow, unconfigured
 * or wrong costs a few seconds of a progress line and nothing else.
 *
 * THE PANE IS THE OTHER HALF OF THE JOB. A receipt that has been uploaded and
 * then hidden behind a filename is a receipt nobody checks the figures against,
 * and checking them is the entire reason a person is still in the loop. So the
 * document stays on screen at a size you can read - beside the fields on a
 * desktop, above them on a phone - and the browser renders it from bytes it
 * already has, with no second download.
 */
export function ReceiptUpload({
  name = 'receiptKey',
  /**
   * The key already on the record, when editing.
   *
   * It has to round-trip through the form. Without it the field posts an empty
   * string, and an edit that never touched the receipt would detach the one
   * already attached.
   */
  defaultKey = null,
  /** The hash already on the record. Round-trips for the same reason. */
  defaultSha256 = null,
  /** Narrows the duplicate search. Not used to read the receipt. */
  propertyId = null,
  /** Set when editing, so an expense cannot be reported as its own duplicate. */
  expenseId = null,
  /**
   * Which ledger this receipt is being attached to.
   *
   * Only the duplicate search cares. It looks at expenses and nothing else, so
   * asking it about a charity's acknowledgment letter returns the answer to a
   * different question - and "already attached to an expense" is a warning
   * nobody on a donation form can do anything with.
   */
  scope = 'expense',
  /**
   * Whether an uploaded file should be read by the model.
   *
   * False when correcting a record that already exists - see the `mode` note on
   * the extract route. The upload, the hash and the duplicate check all still
   * happen; only the reading is skipped, so the caller's fields are never
   * touched by anything it did not type.
   */
  read = true,
  /**
   * Tells the form an upload is in flight.
   *
   * The key only exists once S3 has the bytes, so a save submitted before then
   * posts an empty field - and the expense saves successfully with no receipt
   * on it while the object sits orphaned in the bucket. Nothing about that
   * looks like a failure from either end, which is what made it worth wiring
   * the two components together rather than leaving the button to guess.
   *
   * Reading is NOT reported as busy. By then the key exists and the expense is
   * saveable; making somebody wait out an optional convenience would be the
   * wrong trade for anyone who would rather just type it.
   */
  onBusyChange,
  /**
   * Whether there is a receipt on the form at all.
   *
   * Separate from `onRead` because the two answer different questions: a
   * receipt can be attached and unread, and a read that returned nothing is not
   * a receipt that went away. The form arranges itself around the first, so it
   * has to be told plainly.
   */
  onAttachedChange,
  /** Fires once the receipt has been dealt with, however that turned out. */
  onRead,
}: {
  name?: string;
  defaultKey?: string | null;
  defaultSha256?: string | null;
  propertyId?: string | null;
  expenseId?: string | null;
  scope?: 'expense' | 'donation';
  read?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onAttachedChange?: (attached: boolean) => void;
  onRead?: (read: ReceiptRead) => void;
}) {
  const [status, setStatus] = useState<Status>(defaultKey ? 'done' : 'idle');
  const [key, setKey] = useState(defaultKey ?? '');
  const [sha256, setSha256] = useState(defaultSha256 ?? '');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState(defaultKey ? basename(defaultKey) : '');
  /**
   * What to draw in the pane.
   *
   * For a file chosen a moment ago this is an object URL - the bytes are in the
   * page already, so the preview is instant and costs no request. For a receipt
   * already on the record it is the view endpoint, which redirects to a signed
   * URL; that only works once a record claims the key, which is exactly the
   * case being described.
   */
  const [preview, setPreview] = useState<{ url: string; kind: 'image' | 'doc' } | null>(
    defaultKey ? previewForKey(defaultKey) : null,
  );
  /** Fit the pane, or show the document at full size in a scroller. */
  const [zoomed, setZoomed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  // An object URL holds the file in memory until it is handed back.
  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  function showLocally(file: File) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setPreview({ url, kind: file.type === 'application/pdf' ? 'doc' : 'image' });
  }

  async function upload(file: File) {
    setStatus('uploading');
    setError(null);
    setFilename(file.name);
    setSha256('');
    setZoomed(false);
    // Before the network, not after: the photograph appears the instant it is
    // taken, which is what makes the wait legible as progress on something.
    showLocally(file);
    onBusyChange?.(true);

    let uploadedKey: string;
    let readToken: string;

    try {
      let presignResponse: Response;
      try {
        presignResponse = await fetch('/api/v1/receipts/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            filename: file.name,
          }),
        });
      } catch {
        throw new Error('Could not reach the app to prepare the upload. Check your connection.');
      }

      const presign = (await presignResponse.json()) as {
        uploadUrl?: string;
        key?: string;
        readToken?: string;
        message?: string;
      };

      if (!presignResponse.ok || !presign.uploadUrl || !presign.key || !presign.readToken) {
        throw new Error(presign.message ?? 'Could not prepare the upload.');
      }

      let putResponse: Response;
      try {
        putResponse = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
      } catch {
        /**
         * A rejected fetch here is a network-level failure, and the browser
         * will not say why - a blocked cross-origin PUT and a dropped signal
         * are the same TypeError. Raw, it reads "Failed to fetch", which sends
         * you looking at the app when the app is fine: the presign above
         * already succeeded, so the credentials and the bucket name are right.
         *
         * The overwhelmingly likely cause is the bucket's CORS rule not
         * listing the origin you are browsing from - which is easy to hit from
         * a phone on the LAN, where the origin is an IP rather than localhost.
         * So the message names the origin, because that is the exact string
         * that has to be pasted into the rule.
         */
        throw new Error(
          `The upload to storage was blocked before it started. If you have signal, ` +
            `the receipt bucket's CORS rule needs to allow ${window.location.origin} ` +
            `(see infra/aws/README.md).`,
        );
      }

      if (!putResponse.ok) {
        throw new Error('The image did not finish uploading. Check your signal and try again.');
      }

      // Only the object key is stored. The signed URL expires.
      uploadedKey = presign.key;
      readToken = presign.readToken;
      setKey(uploadedKey);
      onAttachedChange?.(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The upload failed.');
      setStatus('error');
      onBusyChange?.(false);
      return;
    }

    // The receipt is safely stored from here on. Everything below is optional,
    // so the form is released before it starts.
    onBusyChange?.(false);
    setStatus('reading');

    try {
      const response = await fetch('/api/v1/receipts/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: uploadedKey,
          readToken,
          propertyId,
          expenseId,
          scope,
          mode: read ? 'read' : 'attach',
        }),
      });

      if (!response.ok) throw new Error('unreadable');

      const result = (await response.json()) as ReceiptRead;
      setSha256(result.sha256 ?? '');
      onRead?.(result);
    } catch {
      // A reader that failed is not an upload that failed. The receipt is
      // attached, the form works, and saying so would be noise.
      onRead?.({
        sha256: '',
        extraction: { status: 'skipped', reason: read ? 'unreadable' : 'not_requested' },
        duplicate: null,
      });
    } finally {
      setStatus('done');
    }
  }

  function clear() {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setKey('');
    setSha256('');
    setStatus('idle');
    setError(null);
    setFilename('');
    setPreview(null);
    setZoomed(false);
    if (inputRef.current) inputRef.current.value = '';
    onAttachedChange?.(false);
    // Nothing to report and nothing to say about it: this clears the caller's
    // duplicate warning and reading note without inventing a failure that did
    // not happen.
    onRead?.({ sha256: '', extraction: { status: 'skipped', reason: 'not_requested' }, duplicate: null });
  }

  const busy = status === 'uploading' || status === 'reading';
  const attached = status === 'done' && key !== '';
  // Only the receipt already saved on the record can be opened through the app.
  // A file uploaded a moment ago is in the bucket but not yet on any row, and
  // the view endpoint refuses keys no record claims - so the local copy is what
  // gets opened until the form is submitted.
  const openHref = key && key === defaultKey
    ? `/api/v1/receipts/view?key=${encodeURIComponent(key)}`
    : preview?.url;

  return (
    <section className="receipt-pane" aria-label="Receipt">
      <input type="hidden" name={name} value={key} />
      {/* Empty rather than absent when unknown, so an edit that did not touch
          the receipt posts the hash it arrived with. */}
      <input type="hidden" name="receiptSha256" value={sha256} />

      <div className="receipt-pane-head">
        <span className="receipt-pane-title">Receipt</span>
        {attached ? (
          <span className="tag tag-pos">{key === defaultKey ? 'On file' : 'Attached'}</span>
        ) : (
          <span className="receipt-pane-optional">optional</span>
        )}
        {attached ? (
          <span className="receipt-pane-acts">
            {preview?.kind === 'image' ? (
              <button
                type="button"
                className="act"
                aria-pressed={zoomed}
                onClick={() => setZoomed((z) => !z)}
              >
                {zoomed ? 'Fit' : 'Zoom'}
              </button>
            ) : null}
            {openHref ? (
              <a className="act" href={openHref} target="_blank" rel="noreferrer">
                Open
              </a>
            ) : null}
            <button type="button" className="act" onClick={() => inputRef.current?.click()}>
              Replace
            </button>
            <button type="button" className="act act-danger" onClick={clear}>
              Remove
            </button>
          </span>
        ) : null}
      </div>

      <div className={`receipt-pane-body${zoomed ? ' receipt-pane-body-zoom' : ''}`}>
        {/*
          One input for every path - first choice, replacement, and the camera
          button on a phone. A second one would be a second thing to keep in
          step with the object URL and the S3 key.
        */}
        <input
          ref={inputRef}
          className="receipt-file"
          id="receipt-file"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          disabled={busy}
          aria-describedby="receipt-status"
        />

        {attached && preview ? (
          preview.kind === 'image' ? (
            <img
              className={`receipt-image${zoomed ? ' receipt-image-zoom' : ''}`}
              src={preview.url}
              alt={`Receipt: ${filename}`}
              onClick={() => setZoomed((z) => !z)}
              /*
               * A format the browser will not draw - HEIC, most often, which
               * iOS still produces from the gallery even though the camera
               * path sends JPEG. The file is stored and perfectly valid; only
               * the thumbnail is impossible, so it falls back to the same card
               * a PDF gets rather than leaving a broken image in the pane.
               */
              onError={() => setPreview((p) => (p ? { ...p, kind: 'doc' } : p))}
            />
          ) : (
            <div className="receipt-doc">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2.5h7L18.5 8v13a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-18a.5.5 0 0 1 .5-.5z" />
                <path d="M13 2.5V8h5.5" />
              </svg>
              <b>{filename}</b>
              <span className="hint">
                {/\.pdf$/i.test(filename)
                  ? 'A PDF, attached. Open it to read the figures.'
                  : 'Attached. This browser cannot draw the format, so open it to read the figures.'}
              </span>
            </div>
          )
        ) : attached ? (
          <div className="receipt-doc">
            <b>{filename}</b>
            <span className="hint">Stored with this expense.</span>
          </div>
        ) : (
          <label className="receipt-drop" htmlFor="receipt-file">
            <span className="receipt-drop-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
            </span>
            <span className="receipt-drop-text">
              <b>Photograph the receipt</b>
              <span className="hint">
                {read
                  ? 'Photo or PDF, up to 12MB. It fills the fields in and stays here so you can check them against it.'
                  : 'Photo or PDF, up to 12MB. Filed against this expense - the figures below are left exactly as they are.'}
              </span>
            </span>
          </label>
        )}
      </div>

      <p id="receipt-status" className="receipt-pane-foot hint" role="status">
        {status === 'idle' ? (read ? 'No receipt yet.' : 'No receipt on this expense.') : null}
        {status === 'uploading' ? `Uploading ${filename}…` : null}
        {status === 'reading'
          ? read
            ? `Reading ${filename}… you can fill it in yourself instead.`
            : `Filing ${filename}…`
          : null}
        {status === 'done' ? filename : null}
        {status === 'error' ? 'Nothing attached.' : null}
      </p>

      {error ? (
        <p className="error-text receipt-pane-foot" role="alert">
          {error} You can save the expense now and attach the receipt later.
        </p>
      ) : null}
    </section>
  );
}

/**
 * What a stored key can be drawn as.
 *
 * The extension is all there is to go on - the content type lives on the S3
 * object, and fetching it to decide how to render a thumbnail would cost a
 * round trip to answer a question the filename already answers.
 */
function previewForKey(key: string): { url: string; kind: 'image' | 'doc' } {
  return {
    url: `/api/v1/receipts/view?key=${encodeURIComponent(key)}`,
    kind: /\.pdf$/i.test(key) ? 'doc' : 'image',
  };
}

/** The stored key is a path; only its last segment is worth showing. */
function basename(key: string): string {
  return key.split('/').pop() || key;
}
