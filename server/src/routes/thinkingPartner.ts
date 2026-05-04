import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db/client';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many thinking partner requests' },
});

const MAX_TEXT_LENGTH = 2000;

const SYSTEM_PROMPT = `You are a visual thinking partner on a dark collaborative whiteboard. As the user describes their problem, immediately begin mapping it as a node graph. Return drawing instructions as structured JSON. Be fast and incremental. Surface gaps and questions they haven't considered yet as yellow question nodes.

OUTPUT FORMAT: One JSON object per line (NDJSON). Each line must be a complete, valid JSON object. No arrays, no code fences, no explanation. Just raw JSON objects, one per line.

Node types — always emit a shape element followed immediately by a text label element:
- Problem/challenge: rect, color "#f76a6a" (red)
- Idea/solution: ellipse, color "#6ab8f7" (blue)
- Question/gap: rect, color "#f7d76a" (yellow) — surface what user hasn't thought of
- Decision: rect, color "#6af7c8" (green)

For connections: arrow elements between nodes.

Text label placement: inside the shape, x+12, y+18, width-24, height-24 from shape bounds.

Size guide:
- rect nodes: width 160, height 60
- ellipse nodes: width 150, height 70
- text labels: height 28, strokeWidth 1, opacity 0.95
- shapes: strokeWidth 2, opacity 1
- arrows: strokeWidth 1, color "#6b6b8a", opacity 0.7

Rules:
- ONLY emit nodes for NEW concepts not in the already-placed list
- Keep labels short: 3-6 words max
- Main problem goes near center, ideas radiate outward, questions near relevant nodes
- Always add at least one yellow question node surfacing something the user hasn't mentioned
- Place nodes within the viewport bounds provided
- Never repeat a label already in the existing list`;

router.post('/', tpLimiter, async (req, res) => {
  const { text, canvasCenter, canvasViewSize, existingLabels } = req.body as {
    text: unknown;
    canvasCenter: unknown;
    canvasViewSize: unknown;
    existingLabels: unknown;
  };

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: 'text too long' });
    return;
  }

  const cc = (canvasCenter && typeof canvasCenter === 'object') ? canvasCenter as Record<string, unknown> : {};
  const vs = (canvasViewSize && typeof canvasViewSize === 'object') ? canvasViewSize as Record<string, unknown> : {};
  const labels = Array.isArray(existingLabels)
    ? (existingLabels as unknown[]).filter((l): l is string => typeof l === 'string')
    : [];

  const cx = typeof cc.x === 'number' ? cc.x : 0;
  const cy = typeof cc.y === 'number' ? cc.y : 0;
  const vw = typeof vs.width === 'number' ? vs.width : 1200;
  const vh = typeof vs.height === 'number' ? vs.height : 800;

  const padX = vw * 0.38;
  const padY = vh * 0.38;

  // Fetch user's recent memories silently — used for context injection + memory link nodes
  const memories = await prisma.sessionMemory.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true, summaryText: true, keyTopics: true },
  }).catch(() => []);

  let memoryContext = '';
  if (memories.length > 0) {
    const lines = memories.map((m) => {
      const date = m.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const topics = m.keyTopics.length > 0 ? ` — topics: ${m.keyTopics.join(', ')}` : '';
      return `[${date}] ${m.summaryText}${topics}`;
    });
    memoryContext = `This user's recent whiteboard sessions (for context):\n${lines.join('\n')}\n\nIf the current topic STRONGLY matches a past session, emit one purple memory link node: rect color "#7c6af7" width 220 height 56 opacity 0.85, followed by text element "Explored before — [date]" placed near the most relevant node you're drawing. Only emit this if there is a clear topical match. Do not emit it speculatively.`;
  }

  const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT },
    ...(memoryContext
      ? [{ type: 'text' as const, text: memoryContext, cache_control: { type: 'ephemeral' as const } }]
      : []),
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: systemBlocks,
    messages: [
      {
        role: 'user',
        content: `User's thinking: "${text.trim()}"

Canvas placement zone (canvas coordinates):
- x range: ${Math.round(cx - padX)} to ${Math.round(cx + padX)}
- y range: ${Math.round(cy - padY)} to ${Math.round(cy + padY)}
- Center: (${Math.round(cx)}, ${Math.round(cy)})

Already placed node labels (do NOT emit these again):
${labels.length > 0 ? labels.map((l) => `- "${l}"`).join('\n') : '(none yet — start fresh)'}

Build the node graph now. Output one JSON object per line. Nothing else.`,
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
      // incomplete or non-JSON — skip
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
    console.error('[thinking-partner]', err);
    res.write('event: error\ndata: {"error":"Stream failed"}\n\n');
    res.end();
  });
});

export default router;
