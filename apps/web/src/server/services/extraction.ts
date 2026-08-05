import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { z } from 'zod';
import { listScheduleECategories, SCHEDULE_E_CATEGORY_IDS } from '@rental/domain';
import { env } from '@/env';

/**
 * Reading an uploaded receipt.
 *
 * The form this feeds is built for the fifteen-second case at a hardware store
 * counter, and the figures on the receipt are already the answer to most of it.
 * So the file is read once, on the way in, and the fields arrive filled.
 *
 * NOTHING HERE IS AUTHORITATIVE. The result is a suggestion sitting in a form
 * that a person still has to look at and submit - which is why every failure
 * path below returns a `skipped` reason rather than throwing. A receipt that
 * cannot be read must leave the expense saveable by hand, exactly as before;
 * the alternative is an outage in the model taking the whole capture flow down
 * with it.
 */

const MODEL = 'claude-opus-5';

/**
 * The long edge Claude's vision tier renders at. Sending more pixels than this
 * buys no detail and costs image tokens; sending a 12MB phone photo also
 * exceeds the API's 5MB per-image limit, which our own upload limit does not.
 */
const MAX_IMAGE_EDGE = 2576;

/** What the API accepts as an image. HEIC is deliberately not on this list. */
const VISION_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractedReceipt {
  vendor: string;
  /** Invoice date as YYYY-MM-DD. */
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

export type ExtractionResult =
  | { status: 'extracted'; extracted: ExtractedReceipt }
  /** The file is fine, it just is not a receipt. */
  | { status: 'not_receipt' }
  | { status: 'skipped'; reason: 'heic' | 'unsupported' | 'not_configured' | 'unreadable' };

/** Just the yes/no, read before anything that depends on the answer. */
const verdict = z.object({ isReceipt: z.boolean() });

/**
 * Mirrors the JSON schema below.
 *
 * Structured outputs guarantee the shape, not the sense: a date can still come
 * back as `2026-13-45` and an amount as a float. So the response is parsed
 * again here, and a value that fails is dropped to the caller as unreadable
 * rather than being written into a form field.
 */
const responseSchema = z.object({
  isReceipt: z.boolean(),
  vendor: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents: z.number().int().min(0).max(1_000_000_000),
  scheduleECategory: z.enum(SCHEDULE_E_CATEGORY_IDS as unknown as [string, ...string[]]),
  contractorName: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(500),
  confidence: z.object({
    vendor: z.enum(['high', 'medium', 'low']),
    date: z.enum(['high', 'medium', 'low']),
    amount: z.enum(['high', 'medium', 'low']),
  }),
});

let client: Anthropic | null = null;

function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export async function extractReceipt(input: {
  bytes: Buffer;
  contentType: string;
  /** Anchors relative dates on the receipt, and bounds what counts as plausible. */
  today: string;
}): Promise<ExtractionResult> {
  if (!env.hasExtraction) return { status: 'skipped', reason: 'not_configured' };

  // HEIC never reaches the model. Decoding it needs a libheif build that is the
  // wrong trade for a handful of receipts a year, and iOS sends JPEG through a
  // camera capture anyway - so this is a rare path, not the common one.
  if (input.contentType === 'image/heic') return { status: 'skipped', reason: 'heic' };

  const isPdf = input.contentType === 'application/pdf';
  if (!isPdf && !VISION_TYPES.has(input.contentType)) {
    return { status: 'skipped', reason: 'unsupported' };
  }

  try {
    // Built whole per branch rather than sharing a `source`: a PDF is a
    // `document` block and an image is an `image` block, and the two carry
    // different source types.
    const receiptBlock: Anthropic.ContentBlockParam = isPdf
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: input.bytes.toString('base64'),
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: await downscale(input.bytes),
          },
        };

    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Reading printed figures off a page is not a reasoning problem. Low
      // effort keeps the thinking budget - which bills as output - proportional
      // to a task whose hard part is the eyesight.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: jsonSchema() } },
      system: systemPrompt(input.today),
      messages: [
        {
          role: 'user',
          content: [receiptBlock, { type: 'text', text: 'Read this receipt.' }],
        },
      ],
    });

    // A refusal is a successful HTTP response with no content to read, so it
    // has to be checked before the content is touched.
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      return { status: 'skipped', reason: 'unreadable' };
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const payload: unknown = JSON.parse(text);

    // Asked first, and on its own. When the answer is no, the rest of the
    // object is placeholders the prompt asked for and nobody will read - so
    // validating them here would turn "that is a photo of a wall" into "that
    // could not be read", which sends somebody looking for a problem with
    // their camera instead of with their choice of photo.
    if (verdict.safeParse(payload).data?.isReceipt === false) {
      return { status: 'not_receipt' };
    }

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) return { status: 'skipped', reason: 'unreadable' };

    const { isReceipt: _isReceipt, ...extracted } = parsed.data;
    return { status: 'extracted', extracted };
  } catch {
    // Rate limits, timeouts, malformed JSON, a bad image - all the same to the
    // caller, who has a working form either way. The distinction would only
    // matter if there were something to retry, and there is not: the person is
    // waiting, and typing four fields is faster than a backoff.
    return { status: 'skipped', reason: 'unreadable' };
  }
}

/**
 * Re-encodes to a JPEG the API will accept.
 *
 * `withoutEnlargement` matters: a small scan should not be upscaled into
 * blur, which reads worse than the original and costs more tokens.
 */
async function downscale(bytes: Buffer): Promise<string> {
  const out = await sharp(bytes)
    .rotate() // honours the EXIF orientation, so a phone photo is not sideways
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  return out.toString('base64');
}

function systemPrompt(today: string): string {
  const lines = listScheduleECategories()
    .map((c) => `- ${c.id}: ${c.label}. ${c.helper}`)
    .join('\n');

  return `You read receipts and invoices for a small residential rental property business and return their figures as JSON.

Today is ${today}.

Rules:
- amountCents is the GRAND TOTAL actually charged, including tax, in whole cents. $124.99 is 12499. If a tip or a delivery fee is on the receipt, it is part of the total. Never return a subtotal or a single line item.
- date is the date printed on the receipt, as YYYY-MM-DD. If only a partial date is printed, infer the year from context and today's date. Never invent a date that is in the future.
- vendor is the trading name of the business paid, as a person would say it: "Home Depot", not "THE HOME DEPOT #6112".
- contractorName is set only when the receipt is an invoice from a tradesperson or a contracting firm for their labour - a plumber, an electrician, a roofer, a landscaping company. A shop where materials were bought is not a contractor. Otherwise it is null.
- notes is a short plain summary of what was bought, under 200 characters. No line-item dump.
- isReceipt is false when the image is not a receipt, an invoice, or a bill at all. When it is false, still return the other fields with placeholder values - they will be discarded.

scheduleECategory must be exactly one of these Schedule E lines:
${lines}

Guidance on the ambiguous ones:
- Materials and parts bought at a shop are supplies, even when they will be used for a repair.
- Money paid to somebody for the work itself is repairs.
- Routine recurring upkeep - lawn care, cleaners, pest control, gutter clearing - is cleaning_maintenance.
- Use other only when nothing else fits.

Report confidence honestly and per field. Use low when the figure is cut off, smudged, handwritten, or you had to guess between two readings; medium when it is legible but ambiguous; high only when it is plainly printed and unambiguous. An overstated confidence is worse than a low one, because low confidence is what sends the expense to be checked by hand.`;
}

/**
 * The wire schema.
 *
 * Written out rather than derived from the zod object above because structured
 * outputs impose their own restrictions - every object needs
 * `additionalProperties: false` and a complete `required` - and a generated
 * schema that quietly violates one of them fails at the API, far from the
 * definition. The enum is generated, because that is the part that would
 * actually drift.
 */
function jsonSchema(): Record<string, unknown> {
  const confidence = { type: 'string', enum: ['high', 'medium', 'low'] };

  return {
    type: 'object',
    properties: {
      isReceipt: { type: 'boolean' },
      vendor: { type: 'string' },
      date: { type: 'string', description: 'YYYY-MM-DD' },
      amountCents: { type: 'integer', description: 'Grand total in whole cents' },
      scheduleECategory: { type: 'string', enum: [...SCHEDULE_E_CATEGORY_IDS] },
      contractorName: { type: ['string', 'null'] },
      notes: { type: 'string' },
      confidence: {
        type: 'object',
        properties: { vendor: confidence, date: confidence, amount: confidence },
        required: ['vendor', 'date', 'amount'],
        additionalProperties: false,
      },
    },
    required: [
      'isReceipt',
      'vendor',
      'date',
      'amountCents',
      'scheduleECategory',
      'contractorName',
      'notes',
      'confidence',
    ],
    additionalProperties: false,
  };
}
