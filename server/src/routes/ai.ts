import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Rate limiting ────────────────────────────────────────────────────────────

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — try again in 15 minutes' },
});

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 500;
const MAX_BASE64_BYTES = 4 * 1024 * 1024;
const MAX_COORD = 1_000_000;

const SYSTEM_PROMPT = `You are an AI drawing assistant for "Specter", a real-time collaborative whiteboard.
The canvas has a dark aesthetic (#0a0a0f background). Elements are drawn in a hand-sketched Rough.js style.

Your job: given a screenshot of a selected canvas region and a user prompt, return drawing elements to place inside that region.

Preferred colors for the dark canvas:
- #e8e8f0  (off-white — main drawing color)
- #7c6af7  (purple accent)
- #f76a6a  (red/coral)
- #6af7c8  (cyan/mint)
- #f7d76a  (yellow)
- #6ab8f7  (blue)
- #f76ad7  (pink)

Each element must strictly follow this shape:
{
  "type": "pen" | "rect" | "ellipse" | "line" | "arrow" | "text",
  "x": number,
  "y": number,
  "width": number,
  "height": number,
  "color": "#rrggbb",
  "strokeWidth": number,
  "opacity": number,
  "text": "string",          // only for type "text"
  "points": [{"x":n,"y":n}] // only for type "pen", minimum 6 points
}

Rules:
- ALL coordinates must stay within the region bounds given in the user message
- "pen" elements need at least 6 points forming a smooth path
- "text" elements: set width=200, height=28, include the "text" field
- strokeWidth range: 1-6
- opacity range: 0.1-1.0

OUTPUT FORMAT: Output one JSON object per line (NDJSON). Each line must be a complete, valid JSON object on its own line. No arrays, no code fences, no explanation, no markdown. Just raw JSON objects, one per line.

Example output format:
{"type":"rect","x":100,"y":150,"width":200,"height":100,"color":"#7c6af7","strokeWidth":2,"opacity":1}
{"type":"text","x":110,"y":265,"width":180,"height":28,"color":"#e8e8f0","strokeWidth":1,"opacity":1,"text":"Hello"}`;

// ─── Validation ───────────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

function validateBounds(b: unknown): b is { x: number; y: number; width: number; height: number } {
  if (!b || typeof b !== 'object') return false;
  const { x, y, width, height } = b as Record<string, unknown>;
  return (
    isFiniteNumber(x) && isFiniteNumber(y) &&
    isFiniteNumber(width) && isFiniteNumber(height) &&
    width > 0 && height > 0 &&
    Math.abs(x) < MAX_COORD && Math.abs(y) < MAX_COORD &&
    width < MAX_COORD && height < MAX_COORD
  );
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post('/draw', aiLimiter, async (req, res) => {
  const { prompt, canvasImageBase64, regionBounds } = req.body as {
    prompt: unknown;
    canvasImageBase64: unknown;
    regionBounds: unknown;
  };

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    res.status(400).json({ error: 'prompt must be a non-empty string' });
    return;
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: `prompt must be under ${MAX_PROMPT_LENGTH} characters` });
    return;
  }
  if (typeof canvasImageBase64 !== 'string' || canvasImageBase64.length === 0) {
    res.status(400).json({ error: 'canvasImageBase64 must be a non-empty string' });
    return;
  }
  if (canvasImageBase64.length > MAX_BASE64_BYTES) {
    res.status(400).json({ error: 'Image too large' });
    return;
  }
  if (!validateBounds(regionBounds)) {
    res.status(400).json({ error: 'regionBounds must have finite positive width and height' });
    return;
  }

  const { x, y, width, height } = regionBounds;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: canvasImageBase64,
            },
          },
          {
            type: 'text',
            text: `Draw: "${prompt.trim()}"

Region bounds (all coordinates must stay inside these):
- x: ${x} to ${x + width}
- y: ${y} to ${y + height}
- center: (${Math.round(x + width / 2)}, ${Math.round(y + height / 2)})
- width: ${width}, height: ${height}

The image shows what is currently in this region. Add new elements that fulfill the request.
Output one JSON object per line. Nothing else.`,
          },
        ],
      },
    ],
  });

  // Abort stream if client disconnects
  req.on('close', () => { stream.abort(); });

  let lineBuffer = '';

  function flushLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      JSON.parse(trimmed);
      res.write(`data: ${trimmed}\n\n`);
    } catch {
      // Not valid JSON yet — ignore
    }
  }

  stream.on('text', (text) => {
    lineBuffer += text;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    for (const line of lines) flushLine(line);
  });

  stream.on('finalMessage', () => {
    flushLine(lineBuffer);
    lineBuffer = '';
    res.write('event: done\ndata: {}\n\n');
    res.end();
  });

  stream.on('error', (err) => {
    console.error('[ai/draw]', err);
    res.write('event: error\ndata: {"error":"Stream failed"}\n\n');
    res.end();
  });
});

export default router;
