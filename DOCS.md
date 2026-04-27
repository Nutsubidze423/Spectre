# Specter — Technical Documentation

> Real-time collaborative whiteboard. Phases 1–3 complete.

---

## What It Is

Specter is a browser-based collaborative whiteboard with a dark, hand-drawn aesthetic. Multiple users can join a shared room and draw together in real time — seeing each other's cursors, strokes, and shapes as they happen. Built from scratch with raw Canvas API (no canvas libraries), it emphasizes performance, correctness, and a premium feel.

---

## Tech Stack

### Frontend
| Layer | Choice |
|-------|--------|
| Framework | React 18 + Vite 6 + TypeScript |
| Rendering | Raw Canvas API (no Konva, no Fabric) |
| Shapes | Rough.js — hand-drawn aesthetic |
| State | Zustand 5 |
| Animations | Framer Motion |
| Styling | Tailwind CSS + CSS custom properties |
| Realtime | socket.io-client |
| Fonts | JetBrains Mono + Inter (Google Fonts) |

### Backend
| Layer | Choice |
|-------|--------|
| Runtime | Node.js + TypeScript (tsx watch) |
| HTTP | Express 4 |
| Realtime | Socket.io 4 |
| Ephemeral state | Redis (ioredis) — room data, 48hr TTL |
| ORM | Prisma (wired for Phase 5) |
| DB | PostgreSQL (Phase 5) |
| AI | Anthropic SDK — claude-sonnet-4-6 (Phase 4) |

---

## Architecture Overview

```
Spectre/
├── src/                        # React frontend (Vite :5173)
│   ├── canvas/
│   │   ├── CanvasEngine.ts     # Core render engine
│   │   ├── ElementRenderer.ts  # Drawing all element types
│   │   ├── OverlayEngine.ts    # Remote cursor overlay (separate canvas)
│   │   ├── InputHandler.ts     # Mouse/wheel/keyboard → tool events
│   │   └── useCanvas.ts        # React hook wiring everything together
│   ├── tools/
│   │   ├── PenTool.ts          # Freehand pen strokes
│   │   ├── ShapeTool.ts        # Rect, ellipse, line, arrow
│   │   ├── TextTool.ts         # Inline text editing
│   │   ├── EraserTool.ts       # Hit-test based erasing
│   │   ├── SelectionTool.ts    # Click, multi-select, rubber-band, move
│   │   └── AISelectionTool.ts  # Stub — Phase 4
│   ├── room/
│   │   ├── RoomEngine.ts       # Socket.io client (singleton)
│   │   └── useRoom.ts          # React hook wiring RoomEngine → stores
│   ├── store/
│   │   ├── canvasStore.ts      # Elements, tools, viewport, undo/redo
│   │   └── roomStore.ts        # Room, users, connection state
│   ├── components/
│   │   ├── Toolbar.tsx         # Tool picker, color, stroke, undo/redo
│   │   └── RoomPanel.tsx       # Create/join room, user list, leave
│   └── types/index.ts          # All shared TypeScript interfaces
│
└── server/                     # Express backend (:3001)
    └── src/
        ├── index.ts            # Entry — wires Express + Socket.io + Redis
        ├── services/
        │   └── redisService.ts # Room/user/element CRUD, socket→room map
        └── socket/
            └── roomHandler.ts  # All Socket.io event handlers
```

---

## How the Canvas Works

### Two-Canvas Architecture

The app renders two stacked `<canvas>` elements:

1. **Main canvas** — renders all drawing elements, grid, active strokes, selection overlays. Driven by a dirty-flag RAF loop: only re-renders when something changes.
2. **Overlay canvas** — renders remote user cursors only. Has its own always-running RAF loop. `pointer-events: none` so it never intercepts input.

This separation means cursor updates never cause a full canvas repaint.

### Coordinate System

All elements are stored in **canvas space** (infinite logical coordinate plane). The viewport (`offsetX`, `offsetY`, `zoom`) maps between canvas and screen:

```
screenX = canvasX * zoom + offsetX
canvasX = (screenX - offsetX) / zoom
```

Zoom is pinned to the cursor position: before zooming, record the canvas point under the cursor, then after changing zoom, recompute `offsetX/offsetY` so that same canvas point lands back under the cursor.

### Render Pipeline (per frame)

```
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // DPR scaling
ctx.fillRect(...)                          // clear background (#0a0a0f)
ctx.save()
ctx.translate(offsetX, offsetY)
ctx.scale(zoom, zoom)
  → renderGrid()                           // dot grid, fades when zoomed out
  → elementRenderer.renderAll(elements)   // committed elements
  → remote strokes (Map<id, stroke>)      // other users' in-progress pen
  → activeStroke (Catmull-Rom spline)     // local in-progress pen
  → previewElement (75% opacity)          // shape drag preview
  → selectionOverlay (handles)            // 8 resize handles on selected
  → selectionRect (rubber-band)           // drag-to-select rectangle
ctx.restore()
```

### Element Types

All elements share a common interface (`CanvasElement`):

```typescript
{
  id, type, x, y, width, height,   // identity + bounding box
  color, strokeWidth, opacity,      // style
  roughSeed,                        // fixed seed → consistent Rough.js sketch
  points?,                          // pen strokes only: array of Point
  text?,                            // text elements only
  createdBy, createdAt, version     // provenance + cache invalidation
}
```

**Pen** — Points are distance-filtered (skips points < 3px apart). Drawn as Catmull-Rom spline (`bezierCurveTo` with control points at `p ± (p[n+1] - p[n-1]) / 6`).

**Shapes** (rect, ellipse, line, arrow) — Rendered via Rough.js for the hand-drawn look. Each shape's `roughSeed` is fixed at creation so it sketches the same way every re-render. Rough.js `Drawable` objects are memoized in a `Map<"${id}-${version}", Drawable>` capped at 400 entries — avoids regenerating on every frame.

**Text** — A `contenteditable div` is positioned at the click point in screen space, styled with JetBrains Mono at `strokeWidth × 7 × zoom` px. On Enter/blur it commits to a `CanvasElement` stored in canvas coordinates.

**Eraser** — Uses point-to-segment distance for pen strokes and bounding-box expansion for shapes. One snapshot is pushed before the entire erase drag.

### Tool System

Tools are pure TypeScript classes that receive a `ToolContext` object — they have no React imports and no direct store access. `InputHandler` converts raw DOM events into normalized `ToolEvent` objects (`{type, canvasPoint, screenPoint, shiftKey, ctrlKey}`) and routes them to the active tool.

```
DOM event → InputHandler → ToolEvent → activeTool.onEvent(event)
                                     → ToolContext callbacks
                                        → canvasStore mutations
                                        → RoomEngine emissions
```

### Undo / Redo

Zustand store maintains `past: CanvasElement[][]` and `future: CanvasElement[][]` (max 50 each).

- `pushSnapshot()` is called **before** every destructive action — not after.
- Move operations push one snapshot on `mouseUp`, not on every `mousemove`.
- `undo()` pops from `past`, pushes current to `future`. `redo()` reverses.
- Keyboard: `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`.

---

## How Multiplayer Works

### Room Lifecycle

```
User A clicks "Create Room"
  → RoomEngine.socket.connect()
  → emit room:create
  → server generates 6-char code (e.g. "XK7M2P"), stores in Redis
  → server emits room:created { roomId: "XK7M2P", code, myUserId, myColor }
  → RoomPanel shows code to share

User B enters "XK7M2P" and clicks Join
  → emit room:join { roomId: "XK7M2P" }
  → server loads elements + users from Redis
  → server emits room:joined (bulk snapshot to B) + user:joined to A
  → B's canvas bulk-loads all existing elements
```

Room ID **is** the room code — 6 uppercase alphanumeric chars (ambiguous chars removed). No separate lookup needed.

### Redis Schema

```
room:{code}              → hash { hostSocketId, createdAt }
room:{code}:users        → hash { socketId → JSON(RoomUser) }
room:{code}:elements     → hash { elementId → JSON(CanvasElement) }
socket:{socketId}:room   → string (roomId for fast disconnect lookup)
```

All keys share a 48-hour TTL, refreshed on every join.

### Real-Time Events

| Direction | Event | Payload | Purpose |
|-----------|-------|---------|---------|
| C→S | `cursor:move` | `{x, y}` | Cursor position (canvas coords) |
| S→C | `cursor:moved` | `{userId, x, y}` | Broadcast cursor to others |
| C→S | `stroke:point` | `{elementId, x, y}` | In-progress pen point |
| S→C | `stroke:point` | `{userId, elementId, x, y}` | Relay to others |
| C→S | `stroke:complete` | `{element}` | Finished pen stroke |
| S→C | `stroke:complete` | `{userId, element}` | Relay + store in Redis |
| C→S | `element:add` | `{element}` | Shape/text committed |
| S→C | `element:added` | `{element}` | Relay to others |
| C→S | `element:update` | `{id, changes}` | Move/resize |
| S→C | `element:updated` | `{id, changes}` | Relay to others |
| C→S | `element:delete` | `{ids[]}` | Eraser/delete key |
| S→C | `element:deleted` | `{ids[]}` | Relay to others |
| S→C | `user:joined` | `RoomUser` | New participant |
| S→C | `user:left` | `{userId}` | Disconnect/leave |

**Pen strokes use a separate event pair** (`stroke:point` / `stroke:complete`) instead of `element:add`, so remote users see the stroke being drawn in real time — not just the final result.

### Cursor Throttle

`RoomEngine.emitCursorMove()` checks `Date.now() - lastCursorEmit < 33ms` before emitting — enforces a 30fps cap on cursor events.

### Remote Stroke Rendering

Incoming `stroke:point` events populate `CanvasEngine.remoteStrokes: Map<elementId, {points, color, strokeWidth}>`. These are rendered in the main canvas RAF loop (same Catmull-Rom path as local strokes) above committed elements. On `stroke:complete`, the remote stroke is cleared from the map and the final element is added to the store.

### Cursor Overlay

`OverlayEngine` runs its own RAF loop on the overlay canvas. For each tracked cursor:
- Transforms canvas coordinates to screen: `sx = x * zoom + offsetX`
- Draws a 5-dot trail (last 5 positions at decreasing opacity)
- Draws a filled dot (6px) + thin ring at current position
- Draws user's name in a rounded label in their color
- Fades the entire cursor out linearly starting 2s after last update, gone at 4s

---

## Design System

| Token | Value |
|-------|-------|
| `--bg` | `#0a0a0f` |
| `--panel` | `rgba(15, 15, 25, 0.88)` + `backdrop-filter: blur(28px)` |
| `--accent` | `#7c6af7` |
| `--accent-lo / md / hi` | accent at 10% / 22% / 45% opacity |
| `--text` | `#e8e8f0` |
| `--text-dim` | `#6b6b8a` |
| `--border` | `rgba(120, 120, 180, 0.13)` |
| Font mono | JetBrains Mono |
| Font sans | Inter |

All panels use `backdrop-filter: blur(28px)` with the panel background for a glassmorphic effect. The toolbar animates in from below on load (Framer Motion). The active tool indicator slides between buttons using Framer Motion's `layoutId="active-tool"`.

User colors are assigned from a pool of 8 on the server: `#7c6af7 #f76a6a #6af7c8 #f7d76a #6ab8f7 #f76ad7 #a0f76a #f7a06a`.

---

## Running Locally

```bash
# Redis (required for multiplayer)
docker run -d -p 6379:6379 redis

# Backend
cd server && npm run dev      # :3001

# Frontend
npm run dev                   # :5173
```

---

## Phase Tracker

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation — canvas engine, zoom/pan, toolbar | ✅ Done |
| 2 | Drawing — pen, shapes, text, eraser, selection, undo/redo | ✅ Done |
| 3 | Multiplayer — Socket.io rooms, remote cursors, live sync | ✅ Done |
| 4 | AI Assistant — Claude vision, rubber-band region → elements | ⬜ Pending |
| 5 | Persistence + Auth — Postgres, Prisma, JWT, saved boards | ⬜ Pending |
| 6 | Polish — PWA, ghost mode, cursor trails, perf audit | ⬜ Pending |
