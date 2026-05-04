import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db/client';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_CANVAS_TEXT = 4000;

const SUMMARY_PROMPT = `You are summarizing a whiteboard session for a user's persistent memory. Analyze the canvas description and return a JSON object with exactly these fields:
{
  "summary": "2-3 sentence paragraph describing the problem explored, key ideas surfaced, and any decisions or open questions",
  "keyTopics": ["topic1", "topic2", "topic3"]
}

Rules:
- summary: concise, specific, past-tense
- keyTopics: 3-6 short noun phrases that capture the core concepts (for future matching)
- Return ONLY the JSON object, no code fences`;

// ─── Generate session summary ─────────────────────────────────────────────────

router.post('/generate', async (req, res) => {
  const { canvasText, boardId } = req.body as {
    canvasText: unknown;
    boardId: unknown;
  };

  if (typeof canvasText !== 'string' || canvasText.trim().length === 0) {
    res.status(400).json({ error: 'canvasText required' });
    return;
  }
  if (canvasText.length > MAX_CANVAS_TEXT) {
    res.status(400).json({ error: 'canvasText too long' });
    return;
  }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SUMMARY_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Summarize this whiteboard session:\n\n${canvasText.trim()}`,
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      res.status(500).json({ error: 'Summary generation failed' });
      return;
    }

    const parsed = JSON.parse(match[0]) as { summary?: string; keyTopics?: string[] };
    const summaryText = typeof parsed.summary === 'string' ? parsed.summary : raw.slice(0, 500);
    const keyTopics = Array.isArray(parsed.keyTopics)
      ? parsed.keyTopics.filter((t): t is string => typeof t === 'string').slice(0, 8)
      : [];

    await prisma.sessionMemory.create({
      data: {
        userId: req.userId,
        boardId: typeof boardId === 'string' && boardId ? boardId : null,
        summaryText,
        keyTopics,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[memory/generate]', err);
    res.status(500).json({ error: 'Memory generation failed' });
  }
});

// ─── Fetch recent memories ────────────────────────────────────────────────────

router.get('/recent', async (req, res) => {
  try {
    const memories = await prisma.sessionMemory.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        boardId: true,
        createdAt: true,
        summaryText: true,
        keyTopics: true,
      },
    });
    res.json({ memories });
  } catch (err) {
    console.error('[memory/recent]', err);
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
});

export default router;
