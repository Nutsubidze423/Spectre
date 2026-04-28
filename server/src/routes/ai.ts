import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI drawing assistant for "Specter", a real-time collaborative whiteboard.
The canvas has a dark aesthetic (#0a0a0f background). Elements are drawn in a hand-sketched Rough.js style.

Your job: given a screenshot of a selected canvas region and a user prompt, return a JSON array of new drawing elements to place inside that region.

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
- Respond with ONLY a valid JSON array — no markdown, no explanation, no code fences`;

router.post('/draw', async (req, res) => {
  try {
    const { prompt, canvasImageBase64, regionBounds } = req.body as {
      prompt: string;
      canvasImageBase64: string;
      regionBounds: { x: number; y: number; width: number; height: number };
    };

    if (!prompt || !canvasImageBase64 || !regionBounds) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const { x, y, width, height } = regionBounds;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
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
              text: `Draw: "${prompt}"

Region bounds (all coordinates must stay inside these):
- x: ${x} to ${x + width}
- y: ${y} to ${y + height}
- center: (${Math.round(x + width / 2)}, ${Math.round(y + height / 2)})
- width: ${width}, height: ${height}

The image shows what is currently in this region. Add new elements that fulfill the request.
Return only the JSON array.`,
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]';

    // Extract JSON array — handles cases where Claude wraps in code fences
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      res.status(500).json({ error: 'Claude did not return a JSON array', raw });
      return;
    }

    const elements = JSON.parse(match[0]);
    res.json({ elements });
  } catch (err) {
    console.error('[ai/draw]', err);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

export default router;
