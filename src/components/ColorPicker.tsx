import { useCanvasStore } from '../store/canvasStore';

// Phase 2: full color picker with 8 presets + custom hex input.
const PRESETS = ['#e8e8f0', '#7c6af7', '#f76a6a', '#6af7a0', '#f7d76a', '#6ac3f7', '#f76ad7', '#ffffff'];

export function ColorPicker() {
  const color = useCanvasStore((s) => s.color);
  const setColor = useCanvasStore((s) => s.setColor);

  return (
    <div className="color-picker">
      {PRESETS.map((c) => (
        <button
          key={c}
          className={`color-swatch${color === c ? ' active' : ''}`}
          style={{ background: c }}
          onClick={() => setColor(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}
