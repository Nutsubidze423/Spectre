import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';
import { useRoomStore } from '../store/roomStore';
import { getPaddle } from '../lib/paddle';

const LIMIT_MESSAGES: Record<string, { title: string; body: string }> = {
  ai:    { title: 'AI draw limit reached', body: 'You\'ve used all your AI draws for today. Upgrade to get more.' },
  boards: { title: 'Board limit reached', body: 'Free accounts can save up to 3 boards. Upgrade for unlimited.' },
  room:  { title: 'Room is full', body: 'This room has reached the collaborator limit for the host\'s plan.' },
};

export function UpgradeModal() {
  const limitHit = useBillingStore((s) => s.limitHit);
  const clearLimitHit = useBillingStore((s) => s.clearLimitHit);
  const roomFull = useRoomStore((s) => s.roomFull);
  const setRoomFull = useRoomStore((s) => s.setRoomFull);
  const createCheckoutSession = useBillingStore((s) => s.createCheckoutSession);
  const setAppView = useAuthStore((s) => s.setAppView);

  const active = limitHit ?? (roomFull ? { type: 'room' as const, plan: roomFull.plan, limit: roomFull.limit } : null);

  function dismiss() {
    clearLimitHit();
    setRoomFull(null);
  }

  async function handleUpgrade() {
    dismiss();
    const transactionId = await createCheckoutSession('PRO');
    if (transactionId) {
      getPaddle()?.Checkout.open({
        transactionId,
        eventCallback: (data) => {
          if ((data as { name: string }).name === 'checkout.completed') {
            setTimeout(() => void useBillingStore.getState().fetchSubscription(), 2000);
          }
        },
      });
    }
  }

  function handleSeePlans() {
    dismiss();
    setAppView('pricing');
  }

  const msg = active ? (LIMIT_MESSAGES[active.type] ?? LIMIT_MESSAGES.ai) : null;

  return (
    <AnimatePresence>
      {active && msg && (
        <motion.div
          className="upgrade-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            className="upgrade-modal"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="upgrade-icon">⚡</div>
            <h2 className="upgrade-title">{msg.title}</h2>
            <p className="upgrade-body">{msg.body}</p>
            <div className="upgrade-actions">
              <button className="upgrade-btn-primary" onClick={() => void handleUpgrade()}>
                Upgrade to Pro
              </button>
              <button className="upgrade-btn-secondary" onClick={handleSeePlans}>
                See all plans
              </button>
            </div>
            <button className="upgrade-close" onClick={dismiss} aria-label="Close">✕</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
