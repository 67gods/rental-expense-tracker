'use client';

import { useRef, useState } from 'react';

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
      reason: 'heic' | 'unsupported' | 'not_configured' | 'unreadable' | 'duplicate';
    };

export interface ReceiptRead {
  sha256: string;
  extraction: ExtractionOutcome;
  duplicate: DuplicateMatch | null;
}

/**
 * Receipt capture.
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
  /** Fires once the receipt has been read, however that turned out. */
  onRead,
}: {
  name?: string;
  defaultKey?: string | null;
  defaultSha256?: string | null;
  propertyId?: string | null;
  expenseId?: string | null;
  onBusyChange?: (busy: boolean) => void;
  onRead?: (read: ReceiptRead) => void;
}) {
  const [status, setStatus] = useState<Status>(defaultKey ? 'done' : 'idle');
  const [key, setKey] = useState(defaultKey ?? '');
  const [sha256, setSha256] = useState(defaultSha256 ?? '');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState(defaultKey ? basename(defaultKey) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setStatus('uploading');
    setError(null);
    setFilename(file.name);
    setSha256('');
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
        body: JSON.stringify({ key: uploadedKey, readToken, propertyId, expenseId }),
      });

      if (!response.ok) throw new Error('unreadable');

      const read = (await response.json()) as ReceiptRead;
      setSha256(read.sha256 ?? '');
      onRead?.(read);
    } catch {
      // A reader that failed is not an upload that failed. The receipt is
      // attached, the form works, and saying so would be noise.
      onRead?.({ sha256: '', extraction: { status: 'skipped', reason: 'unreadable' }, duplicate: null });
    } finally {
      setStatus('done');
    }
  }

  function clear() {
    setKey('');
    setSha256('');
    setStatus('idle');
    setError(null);
    setFilename('');
    if (inputRef.current) inputRef.current.value = '';
    onRead?.({ sha256: '', extraction: { status: 'skipped', reason: 'unreadable' }, duplicate: null });
  }

  return (
    <div className="field">
      <span className="field-label">Receipt (optional)</span>
      <input type="hidden" name={name} value={key} />
      {/* Empty rather than absent when unknown, so an edit that did not touch
          the receipt posts the hash it arrived with. */}
      <input type="hidden" name="receiptSha256" value={sha256} />

      <input
        ref={inputRef}
        className="input"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        disabled={status === 'uploading' || status === 'reading'}
        aria-describedby="receipt-status"
      />

      <p id="receipt-status" className="hint" role="status">
        {status === 'idle' ? 'Photo or PDF, up to 12MB. Stored with the expense, and read to fill in the fields.' : null}
        {status === 'uploading' ? `Uploading ${filename}…` : null}
        {status === 'reading' ? `Reading ${filename}… you can fill it in yourself instead.` : null}
        {status === 'done' ? (
          <>
            <span className="tag tag-pos">Attached</span> {filename}{' '}
            {/*
              Only the receipt already saved on the record can be viewed. A file
              uploaded a moment ago is in the bucket but not yet on any row, and
              the view endpoint refuses keys no record claims - so offering the
              link before the form is submitted would offer a broken one.
            */}
            {key && key === defaultKey ? (
              <>
                <a
                  className="linkbtn"
                  href={`/api/v1/receipts/view?key=${encodeURIComponent(key)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>{' '}
              </>
            ) : null}
            <button type="button" className="linkbtn" onClick={clear}>
              Remove
            </button>
          </>
        ) : null}
      </p>

      {error ? (
        <p className="error-text" role="alert">
          {error} You can save the expense now and attach the receipt later.
        </p>
      ) : null}
    </div>
  );
}

/** The stored key is a path; only its last segment is worth showing. */
function basename(key: string): string {
  return key.split('/').pop() || key;
}
