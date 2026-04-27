// Phase 4: wraps @anthropic-ai/sdk, sends canvas region + prompt, returns
// structured JSON element list. Validates schema before returning.
export class ClaudeService {
  async draw(
    _prompt: string,
    _canvasRegionBase64: string,
    _existingTypes: string[]
  ): Promise<unknown> {
    throw new Error('Phase 4 — not yet implemented');
  }
}
