import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const challengeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Challenge limit reached — try again in an hour' },
});

const MAX_DESC_LENGTH = 6000;

const SYSTEM_PROMPT = `You are a brutally honest critical thinker. A user has shared their whiteboard diagram with you. Analyze it ruthlessly and identify exactly what is wrong or missing.

Find these categories of problems:
1. Logical gaps — things assumed but not proven or explained
2. Missing connections — nodes that should logically connect but don't
3. Contradictions — two nodes or ideas that conflict with each other
4. Blind spots — important factors, risks, or stakeholders not on the canvas at all

For each finding, draw an orange challenge node near the relevant existing node. Be specific to THIS diagram — never give generic advice. Your questions must be short, sharp, and targeted.

OUTPUT FORMAT: One JSON object per line (NDJSON). Each challenge = one rect element followed immediately by one text element.
- rect: color "#f7834a", width 180, height 60, strokeWidth 2, opacity 0.92
- text: color "#e8e8f0", width 156, height 28, x=rect.x+12, y=rect.y+16, strokeWidth 1, opacity 1

Place each challenge rect NEAR the relevant node (within 80-200px of it). If the challenge is a blind spot with no specific node, place it in open canvas space near the center.

Generate 3 to 7 challenges. Short sharp labels: max 7 words per question. End every label with "?".`;

router.post('/', challengeLimiter, async (req, res) => {
  const { canvasDescription, canvasCenter, canvasViewSize } = req.body as {
    canvasDescription: unknown;
    canvasCenter: unknown;
    canvasViewSize: unknown;
  };

  if (typeof canvasDescription !== 'string' || canvasDescription.trim().length === 0) {
    res.status(400).json({ error: 'canvasDescription required' });
    return;
  }
  if (canvasDescription.length > MAX_DESC_LENGTH) {
    res.status(400).json({ error: 'canvasDescription too long' });
    return;
  }

  const cc = (canvasCenter && typeof canvasCenter === 'object') ? canvasCenter as Record<string, unknown> : {};
  const vs = (canvasViewSize && typeof canvasViewSize === 'object') ? canvasViewSize as Record<string, unknown> : {};
  const cx = typeof cc.x === 'number' ? cc.x : 0;
  const cy = typeof cc.y === 'number' ? cc.y : 0;
  const vw = typeof vs.width === 'number' ? vs.width : 1200;
  const vh = typeof vs.height === 'number' ? vs.height : 800;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Here is the whiteboard diagram to challenge:

${canvasDescription.trim()}

Viewport context:
- Canvas center: (${Math.round(cx)}, ${Math.round(cy)})
- Visible area: ${Math.round(vw)}w × ${Math.round(vh)}h
- Place challenge nodes within this area

Analyze this diagram. Be ruthless. Find what is missing, assumed, contradictory, or blind. Output NDJSON challenge nodes now.`,
      },
    ],
  });

  req.on('close', () => { stream.abort(); });

  let lineBuffer = '';

  function flushLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      JSON.parse(trimmed);
      res.write(`data: ${trimmed}\n\n`);
    } catch {
      // incomplete — skip
    }
  }

  stream.on('text', (chunk) => {
    lineBuffer += chunk;
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
    console.error('[challenge]', err);
    res.write('event: error\ndata: {"error":"Challenge failed"}\n\n');
    res.end();
  });
});

export default router;
