import type { CanvasElement, Rect, AIDrawRequest, AIDrawResponse } from '../types';

// Formats the request, sends to backend, parses structured JSON response,
// offsets coordinates to absolute canvas position.
// Phase 4: full implementation.
export class AIAssistant {
  private apiBase: string;

  constructor(apiBase = '/api') {
    this.apiBase = apiBase;
  }

  async draw(
    _prompt: string,
    _canvasSnapshot: string,
    _regionBounds: Rect,
    _existingTypes: string[]
  ): Promise<CanvasElement[]> {
    // Phase 4 implementation
    return [];
  }

  private buildRequest(
    prompt: string,
    canvasRegion: string,
    regionBounds: Rect,
    existingElementTypes: string[]
  ): AIDrawRequest {
    return { prompt, canvasRegion, regionBounds, existingElementTypes };
  }

  private parseResponse(_res: AIDrawResponse, _offset: Rect): CanvasElement[] {
    // Phase 4: validate, add uuid/timestamps, offset coords
    return [];
  }
}
