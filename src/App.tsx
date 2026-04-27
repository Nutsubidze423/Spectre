import { useCanvas } from './canvas/useCanvas';
import { Toolbar } from './components/Toolbar';
import './index.css';

export default function App() {
  const { canvasRef } = useCanvas();

  return (
    <div className="app">
      <canvas ref={canvasRef} className="main-canvas" />
      <Toolbar />
    </div>
  );
}
