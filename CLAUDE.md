# Specter — CLAUDE.md

> Updated automatically. Reflects current build state.

## Project

Real-time collaborative whiteboard. Dark/minimal aesthetic.  
Repo: https://github.com/Nutsubidze423/Spectre  
Frontend: React 18 + Vite + TypeScript + Canvas API + Rough.js + Zustand + Tailwind + Framer Motion  
Backend: Node.js + Express + Socket.io + Redis + PostgreSQL + Prisma + Anthropic SDK  
Deploy: Railway

## Current Phase

**PHASE 1 — Foundation** ✅ (scaffolded, installing deps)

Goal: infinite canvas with zoom/pan working, tool switcher in UI.

## Phase Tracker

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation (canvas engine, zoom/pan, toolbar) | 🔄 In progress |
| 2 | Drawing (pen/shapes/text/eraser/selection + undo) | ⬜ Pending |
| 3 | Multiplayer (Socket.io, rooms, remote cursors) | ⬜ Pending |
| 4 | AI Assistant (Claude API proxy, AI draw tool) | ⬜ Pending |
| 5 | Persistence + Auth (Postgres, Prisma, JWT, boards) | ⬜ Pending |
| 6 | Polish (ghost mode, PWA, cursor trails, perf audit) | ⬜ Pending |

## Phase 1 Tasks

- [x] Git init + remote set (https://github.com/Nutsubidze423/Spectre.git)
- [x] Frontend scaffold (Vite + React 18 + TS)
- [x] Server scaffold (Express + Socket.io stubs)
- [x] `src/types/index.ts` — all shared types
- [x] `src/canvas/CanvasEngine.ts` — viewport, zoom/pan, grid, RAF loop
- [x] `src/canvas/InputHandler.ts` — mouse + wheel + space-pan
- [x] `src/canvas/ElementRenderer.ts` — placeholder shape renderers
- [x] `src/canvas/useCanvas.ts` — React hook wiring engine
- [x] `src/store/canvasStore.ts` — Zustand element + tool state
- [x] `src/store/roomStore.ts` — Zustand room state (stub)
- [x] `src/components/Toolbar.tsx` — floating pill toolbar, zoom badge
- [x] All tool/room/ai/component stubs with type definitions
- [ ] `npm install` frontend + server
- [ ] Verify dev server: zoom, pan, tool switch

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Package manager | npm | Simple |
| Repo structure | Monorepo (root + server/) | Single repo, two package.json |
| DB client | Prisma | Industry standard, good DX |
| Claude model | claude-sonnet-4-6 | Fast, vision capable |
| Undo/redo | Phase 2 | Don't block Phase 1 |
| Rough.js seed | Fixed per element | Consistent re-render |
| Fonts | JetBrains Mono + Inter | Via Google Fonts |
| Redis (local) | Docker `redis:latest` on :6379 | Switch to Railway on deploy |
| Tests | Skipped | Portfolio project, move fast |

## Architecture

```
src/
├── canvas/         CanvasEngine · OverlayEngine · ElementRenderer
│                   SelectionManager · InputHandler · useCanvas
├── tools/          PenTool · ShapeTool · TextTool · EraserTool
│                   SelectionTool · AISelectionTool
├── room/           RoomEngine · useRoom
├── ai/             AIAssistant · useAIAssistant
├── store/          canvasStore · roomStore
├── components/     Toolbar · ColorPicker · RoomPanel · AIPromptInput
│                   BoardManager · GhostCursor
└── types/          index.ts (shared types)

server/src/
├── routes/         auth · boards · ai
├── socket/         roomHandler
├── services/       claudeService · redisService · canvasSnapshotService
├── middleware/      auth
├── db/             client (Prisma)
└── types/          index.ts
```

## Design System

| Token | Value |
|-------|-------|
| Background | `#0a0a0f` |
| Panel | `rgba(15, 15, 25, 0.85)` + `backdrop-filter: blur` |
| Accent | `#7c6af7` (muted purple) |
| Text | `#e8e8f0` |
| Text dim | `#6b6b8a` |
| Border | `rgba(120, 120, 180, 0.12)` |
| Font mono | JetBrains Mono |
| Font sans | Inter |

## Dev Commands

```bash
# Frontend
npm run dev           # Vite dev server :5173

# Server (Phase 3+)
cd server && npm run dev   # tsx watch :3001

# Redis (local)
docker run -d -p 6379:6379 redis
```

## Notes for Claude

- Always update this file after completing a phase or major step
- Run `npm run dev` and verify visually before marking Phase 1 complete
- Phase 2 starts only after user confirms Phase 1 works
- Rough.js: import `rough` default, use `rough.generator()`, memoize output per element.roughSeed
- Canvas coordinate system: `toCanvasCoords` / `toScreenCoords` in CanvasEngine
- Never render main canvas and overlay canvas from the same event
- All rendering via requestAnimationFrame only
