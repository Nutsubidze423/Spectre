# Specter — CLAUDE.md

> Updated automatically. Reflects current build state.

## Project

Real-time collaborative whiteboard. Dark/minimal aesthetic.  
Repo: https://github.com/Nutsubidze423/Spectre  
Frontend: React 18 + Vite + TypeScript + Canvas API + Rough.js + Zustand + Tailwind + Framer Motion  
Backend: Node.js + Express + Socket.io + Redis + PostgreSQL + Prisma + Anthropic SDK  
Deploy: Railway

## Current Phase

**PHASE 4 — AI Assistant** ✅ Complete

Goal: real-time collaboration via Socket.io + Redis — remote cursors, live strokes, element sync.

## Phase Tracker

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation (canvas engine, zoom/pan, toolbar) | ✅ Done |
| 2 | Drawing (pen/shapes/text/eraser/selection + undo) | ✅ Done |
| 3 | Multiplayer (Socket.io, rooms, remote cursors) | ✅ Done |
| 4 | AI Assistant (Claude API proxy, AI draw tool) | ✅ Done |
| 5 | Persistence + Auth (Postgres, Prisma, JWT, boards) | ⬜ Pending |
| 6 | Polish (ghost mode, PWA, cursor trails, perf audit) | ⬜ Pending |

## Phase 2 Completed

- [x] `canvasStore.ts` — undo/redo (`pushSnapshot`, `undo`, `redo`) with 50-state history
- [x] `CanvasEngine.ts` — `setActiveStroke(pts, color, strokeWidth)`, `setPreviewElement`, `setSelectionRect`, `setSelectedIds`
- [x] `ElementRenderer.ts` — Catmull-Rom bezier for pen, Rough.js (memoized per `id-version`) for shapes, selection overlay with 8 handles, rubber-band rect
- [x] `PenTool.ts` — point distance filtering, Catmull-Rom live stroke preview, snapshot before commit
- [x] `ShapeTool.ts` — live Rough.js preview on drag, Shift=constrain to square/45°, per-element fixed `roughSeed`
- [x] `TextTool.ts` — contenteditable div at screen coords, font scales with zoom+strokeWidth, Enter to commit
- [x] `EraserTool.ts` — path intersection for pen (point-to-segment dist), bbox expansion for shapes
- [x] `SelectionTool.ts` — click select, Shift multi-select, rubber band, drag move (with undo on mouseup)
- [x] `useCanvas.ts` — full tool map, Ctrl+Z/Y undo/redo, Delete selected, Escape cancel
- [x] `Toolbar.tsx` — inline color flyout (8 presets + hex input), stroke stepper, undo/redo buttons
- [x] `index.css` — all new styles, text-tool-input glassmorphic caret

## Key Architecture Notes

- **Undo/redo**: Zustand `past`/`future` stacks. `pushSnapshot()` called BEFORE each destructive action. Move pushes snapshot on mouseUp (not every move).
- **Rough.js memoization**: `ElementRenderer.drawableCache` keyed by `${id}-${version}`. Old version evicted on new draw. Cap at 400 entries.
- **Active stroke**: stored in `CanvasEngine.activeStroke` with color+strokeWidth — drawn via Catmull-Rom above elements, cleared on mouseUp.
- **Preview element**: `CanvasEngine.previewElement` holds in-progress shape — rendered at 75% opacity, immediate (uncached) Rough.js.
- **Selection**: `selectedIds` synced to both store and engine. Handles rendered by `ElementRenderer.renderSelectionOverlay` in canvas-coord space (sizes divided by zoom).

## Key Decisions

| Decision | Choice |
|----------|--------|
| Package manager | npm |
| Repo structure | Monorepo (root + server/) |
| DB client | Prisma |
| Claude model | claude-sonnet-4-6 |
| Undo/redo | Phase 2 ✅ |
| Rough.js seed | Fixed per element on creation |
| Fonts | JetBrains Mono + Inter |
| Redis local | Docker `redis:latest` :6379 |
| Tests | Skipped |

## Architecture

```
src/
├── canvas/         CanvasEngine · OverlayEngine (Ph3) · ElementRenderer
│                   SelectionManager · InputHandler · useCanvas
├── tools/          PenTool ✅ · ShapeTool ✅ · TextTool ✅
│                   EraserTool ✅ · SelectionTool ✅ · AISelectionTool (Ph4)
├── room/           RoomEngine (Ph3) · useRoom (Ph3)
├── ai/             AIAssistant (Ph4) · useAIAssistant (Ph4)
├── store/          canvasStore ✅ · roomStore (Ph3)
├── components/     Toolbar ✅ · ColorPicker · RoomPanel (Ph3)
│                   AIPromptInput (Ph4) · BoardManager (Ph5) · GhostCursor (Ph6)
└── types/          index.ts
```

## Design System

| Token | Value |
|-------|-------|
| Background | `#0a0a0f` |
| Panel | `rgba(15, 15, 25, 0.88)` + `backdrop-filter: blur` |
| Accent | `#7c6af7` |
| Text | `#e8e8f0` |
| Text dim | `#6b6b8a` |
| Border | `rgba(120, 120, 180, 0.13)` |
| Font mono | JetBrains Mono |
| Font sans | Inter |

## Dev Commands

```bash
npm run dev           # Vite :5173
cd server && npm run dev   # Express :3001 (Phase 3+)
docker run -d -p 6379:6379 redis  # Redis (Phase 3+)
```

## Phase 3 Completed

- [x] `server/src/services/redisService.ts` — full Redis CRUD: rooms, users, elements, socket→room mapping, 48hr TTL
- [x] `server/src/socket/roomHandler.ts` — all events: `room:create/join/leave`, `cursor:move`, `stroke:point/complete`, `element:add/update/delete`, `disconnect`
- [x] `server/src/index.ts` — wired RedisService + registerRoomHandler
- [x] `src/room/RoomEngine.ts` — Socket.io singleton (`getRoomEngine()`/`setRoomEngine()`), `autoConnect: false`, cursor throttle 30fps
- [x] `src/canvas/OverlayEngine.ts` — cursor-only RAF loop, trail dots + fade, name labels, `roundRect` label bg
- [x] `src/room/useRoom.ts` — React hook, wires all RoomEngine callbacks to canvasStore/roomStore/OverlayEngine
- [x] `src/store/canvasStore.ts` — added `setElements()` for bulk load on room join
- [x] `src/canvas/CanvasEngine.ts` — `setRemoteStrokePoint`, `clearRemoteStroke`, `clearAllRemoteStrokes`, renders remote strokes in RAF
- [x] `src/canvas/InputHandler.ts` — `onCursorMove` callback, emits canvas-space coords on every mousemove
- [x] `src/tools/PenTool.ts` — added `onStrokePoint` + `onStrokeComplete` to ToolContext
- [x] `src/canvas/useCanvas.ts` — wires cursor emit, stroke events, element add/update/delete all emit to RoomEngine
- [x] `src/components/RoomPanel.tsx` — create/join UI, code display + copy, user list with colored dots, leave button
- [x] `src/App.tsx` — overlay canvas + OverlayEngine lifecycle + useRoom + RoomPanel
- [x] `src/index.css` — overlay-canvas + all room panel styles

## Key Architecture Notes (Phase 3)

- **Room ID = Room Code**: 6 uppercase alphanumeric chars, server-generated. User shares directly.
- **RoomEngine singleton**: `getRoomEngine()` / `setRoomEngine()` — tools and useCanvas access without prop drilling.
- **Remote strokes**: stored in `CanvasEngine.remoteStrokes Map<elementId, {points,color,strokeWidth}>`, rendered in main RAF loop.
- **OverlayEngine**: separate canvas element (pointer-events: none), own RAF loop, cursor trail = last 5 positions drawn as fading dots.
- **Cursor throttle**: 30fps guard in `RoomEngine.emitCursorMove()` via `lastCursorEmit` timestamp.
- **Stroke events**: PenTool uses `stroke:point` + `stroke:complete` (NOT `element:add`). All other tools use `element:add`.
- **Element updates**: emitted on every `onElementUpdate` call (move events). Acceptable for Phase 3.
- **Socket autoConnect: false**: connects only when user takes a room action (create/join).

## Phase 4 Completed

- [x] `server/src/routes/ai.ts` — POST /api/ai/draw: Claude claude-sonnet-4-6 vision call, robust JSON extraction, returns element array
- [x] `server/src/index.ts` — wired ai router at `/api/ai`
- [x] `server/.env` — ANTHROPIC_API_KEY placeholder (user must fill in)
- [x] `src/store/canvasStore.ts` — added `aiRegion: Rect | null` + `setAiRegion`
- [x] `src/canvas/CanvasEngine.ts` — added `captureRegion(rect): string` (DPR-aware offscreen canvas → base64 PNG)
- [x] `src/tools/AISelectionTool.ts` — rubber-band drag → fires `onAiRegion(rect)` callback on mouseUp
- [x] `src/tools/PenTool.ts` — added `onAiRegion` to ToolContext interface
- [x] `src/canvas/useCanvas.ts` — wires `onAiRegion` → `setAiRegion` in toolCtx
- [x] `src/components/AIPromptInput.tsx` — floating panel: prompt input, Generate button, loading spinner, error display, Escape to cancel
- [x] `src/App.tsx` — renders AIPromptInput via AnimatePresence when aiRegion is set
- [x] `src/index.css` — AI prompt panel styles + pulsing region outline + spinner

## Key Architecture Notes (Phase 4)

- **Flow**: `ai-select` tool drag → `onAiRegion(rect)` → `setAiRegion` → `AIPromptInput` appears → user types prompt → `POST /api/ai/draw` → Claude vision → element array → committed to canvas
- **`captureRegion`**: converts canvas rect → screen px → DPR-aware `drawImage` onto offscreen canvas → `toDataURL('image/png').split(',')[1]`
- **Server route**: system prompt defines element schema + color palette + rules; user message includes region bounds as coordinates; robust `[...json...]` regex extraction handles code fences
- **Element hydration**: returned elements get `id = crypto.randomUUID()`, `roughSeed`, `createdBy`, `createdAt`, `version: 0` injected client-side
- **Multiplayer**: each generated element is also emitted via `getRoomEngine()?.emitElementAdd(el)`
- **ANTHROPIC_API_KEY**: must be set in `server/.env` before Phase 4 works

## Notes for Next Claude Session

- Phase 5 starts with: Postgres + Prisma schema, JWT auth (`/api/auth`), board CRUD (`/api/boards`), persist canvas to DB
- Auth: access + refresh token pattern, bcryptjs password hashing
- Board schema: User → Board → BoardSnapshot (elements JSON per save)
- Frontend: login/register pages, board picker, auto-save every 30s
