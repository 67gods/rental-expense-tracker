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

## Adding the Vercel URL later

`s3-cors.json` currently allows only `http://localhost:4000`, which is where
the app runs in development. Local uploads work as soon as the bucket exists.

Once deployed, add the Vercel origin alongside it and paste the rule again:

```json
"AllowedOrigins": [
  "http://localhost:4000",
  "https://your-app.vercel.app"
]
```

Without that, uploads from production fail with a CORS error even though the
credentials are perfectly valid — the presign succeeds and the browser blocks
the PUT. Note that JSON allows no comments; a `//` line will make S3 reject
the whole rule.
