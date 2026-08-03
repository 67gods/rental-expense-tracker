'use client';

import { useRef, useState } from 'react';

type Status = 'idle' | 'uploading' | 'done' | 'error';

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
 */
export function ReceiptUpload({ name = 'receiptKey' }: { name?: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setStatus('uploading');
    setError(null);
    setFilename(file.name);

    try {
      const presignResponse = await fetch('/api/v1/receipts/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          filename: file.name,
        }),
      });

      const presign = (await presignResponse.json()) as {
        uploadUrl?: string;
        key?: string;
        message?: string;
      };

      if (!presignResponse.ok || !presign.uploadUrl || !presign.key) {
        throw new Error(presign.message ?? 'Could not prepare the upload.');
      }

      const putResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error('The image did not finish uploading. Check your signal and try again.');
      }

      // Only the object key is stored. The signed URL expires.
      setKey(presign.key);
      setStatus('done');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The upload failed.');
      setStatus('error');
    }
  }

  function clear() {
    setKey('');
    setStatus('idle');
    setError(null);
    setFilename('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="field">
      <span className="field-label">Receipt (optional)</span>
      <input type="hidden" name={name} value={key} />

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
        disabled={status === 'uploading'}
        aria-describedby="receipt-status"
      />

      <p id="receipt-status" className="hint" role="status">
        {status === 'idle' ? 'Photo or PDF, up to 12MB. Stored with the expense.' : null}
        {status === 'uploading' ? `Uploading ${filename}…` : null}
        {status === 'done' ? (
          <>
            <span className="tag tag-pos">Attached</span> {filename}{' '}
            <button type="button" className="underline underline-offset-2" onClick={clear}>
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
