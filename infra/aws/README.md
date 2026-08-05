# AWS setup — receipt storage

The app needs one S3 bucket and one IAM user. Nothing else in AWS.

Receipts are uploaded straight from the browser to S3 using a short-lived
presigned URL, so a 10MB photo taken in a hardware store aisle never passes
through the app server. Only the object key is stored on the expense record —
the signed URL expires.

## Cost

Effectively nothing. The free tier covers 5GB for the first 12 months; after
that it is about $0.023 per GB per month. A few thousand receipt photos is
1–2GB, so under a nickel a month.

## What the two files are

| File | Where it goes |
|---|---|
| `s3-cors.json` | Bucket → Permissions → Cross-origin resource sharing (CORS) |
| `s3-iam-policy.json` | IAM → the app's user → inline policy |

Replace the `REPLACE-WITH-...` placeholders in both before pasting.

## Why the policy is scoped this narrowly

`s3:PutObject` and `s3:GetObject` on `receipts/*` only. No list, no delete, no
access to any other bucket. If these keys ever leak, the blast radius is the
receipts folder of one bucket — not your AWS account.

The app never deletes receipts, so `s3:DeleteObject` is deliberately absent.

## Why the bucket stays private

Block Public Access stays **on**. These are tax records. The app serves them
through signed URLs that expire in an hour, which is an access model; a
hard-to-guess public URL is not.

## The origin list is the thing that breaks

`s3-cors.json` ships allowing `http://localhost:4000` and `http://127.0.0.1:4000`,
which is where the app runs in development.

**An origin must match exactly — scheme, host and port.** S3 does no
normalising, so `127.0.0.1` is not `localhost`, `https` is not `http`, and port
4000 is not port 3000. Anything not on the list is refused.

The case that catches people is photographing a receipt **on a phone**. The
form opens the rear camera, so it is the natural way to use the feature — but
the phone reaches the dev server over the LAN, which makes the origin something
like `http://192.168.1.42:4000`. That is not `localhost`, so the PUT is blocked
even though the same upload works in the desktop browser.

Add whichever origins you actually browse from, and paste the whole rule again:

```json
"AllowedOrigins": [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://192.168.1.42:4000",
  "https://your-app.vercel.app"
]
```

The failure is asymmetric and worth recognising: the presign call succeeds, so
the credentials, the region and the bucket name are all proven correct, and
only then does the browser block the PUT. The app now reports the origin it is
browsing from when this happens — paste that string into the list above.

Note that JSON allows no comments; a `//` line will make S3 reject the whole
rule.
