import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../store/canvasStore';

export function ChallengeReviewBar() {
  const challengeIds = useCanvasStore((s) => s.challengeIds);
  const acceptAllChallenges = useCanvasStore((s) => s.acceptAllChallenges);
  const dismissAllChallenges = useCanvasStore((s) => s.dismissAllChallenges);

  // Each challenge = 1 rect + 1 text = 2 elements
  const nodeCount = Math.ceil(challengeIds.length / 2);

  return (
    <AnimatePresence>
      {challengeIds.length > 0 && (
        <motion.div
          className="challenge-review-bar"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="challenge-review-icon">⚡</span>
          <span className="challenge-review-label">
            {nodeCount} challenge {nodeCount === 1 ? 'node' : 'nodes'}
          </span>
          <div className="challenge-review-actions">
            <button
              className="challenge-review-btn accept"
              onClick={acceptAllChallenges}
              title="Keep challenge nodes as permanent markers"
            >
              Accept All
            </button>
            <button
              className="challenge-review-btn dismiss"
              onClick={dismissAllChallenges}
              title="Remove all challenge nodes from canvas"
            >
              Dismiss All
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
