import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';
import { useRoomStore } from '../store/roomStore';
import { getPaddle } from '../lib/paddle';

const PLAN_LABEL: Record<string, string> = { SOLO: 'Solo — $9/month', PRO: 'Pro — $19/month', TEAM: 'Team — $49/month' };

export function UpgradeModal() {
  const gateHit = useBillingStore((s) => s.gateHit);
  const clearGateHit = useBillingStore((s) => s.clearGateHit);
  const createCheckoutSession = useBillingStore((s) => s.createCheckoutSession);
  const roomFull = useRoomStore((s) => s.roomFull);
  const setRoomFull = useRoomStore((s) => s.setRoomFull);
  const setAppView = useAuthStore((s) => s.setAppView);

  const roomGate = roomFull
    ? { feature: 'room', title: 'Room is full', body: `This room has reached the collaborator limit for the host's plan. Upgrade to add more users.`, requiredPlan: 'SOLO' as const }
    : null;

  const active = gateHit ?? roomGate;

  function dismiss() {
    clearGateHit();
    setRoomFull(null);
  }

  async function handleUpgrade() {
    if (!active) return;
    dismiss();
    const transactionId = await createCheckoutSession(active.requiredPlan as 'SOLO' | 'PRO' | 'TEAM');
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

  return (
    <AnimatePresence>
      {active && (
        <motion.div className="upgrade-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismiss}>
          <motion.div
            className="upgrade-modal"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="upgrade-icon">⚡</div>
            <h2 className="upgrade-title">{active.title}</h2>
            <p className="upgrade-body">{active.body}</p>
            <div className="upgrade-actions">
              <button className="upgrade-btn-primary" onClick={() => void handleUpgrade()}>
                Upgrade to {PLAN_LABEL[active.requiredPlan] ?? active.requiredPlan}
              </button>
              <button className="upgrade-btn-secondary" onClick={() => { dismiss(); setAppView('pricing'); }}>
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
