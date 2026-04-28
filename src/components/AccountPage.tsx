import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';

const PLAN_LABELS: Record<string, string> = { FREE: 'Free', PRO: 'Pro', TEAM: 'Team' };
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Active', CANCELLED: 'Cancelled', PAST_DUE: 'Past Due' };

export function AccountPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setAppView = useAuthStore((s) => s.setAppView);
  const sub = useBillingStore((s) => s.sub);
  const createPortalSession = useBillingStore((s) => s.createPortalSession);
  const [portalLoading, setPortalLoading] = useState(false);

  async function handleManageBilling() {
    setPortalLoading(true);
    const url = await createPortalSession();
    setPortalLoading(false);
    if (url) window.location.href = url;
  }

  const plan = sub?.plan ?? 'FREE';
  const status = sub?.status ?? 'ACTIVE';
  const usage = sub?.usage;

  return (
    <div className="account-page">
      <div className="account-header">
        <button className="account-back" onClick={() => setAppView('boards')}>
          ← Back
        </button>
        <h1 className="account-title">Account</h1>
      </div>

      <div className="account-body">
        <motion.div
          className="account-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="account-section-label">Profile</div>
          <div className="account-user-info">
            <div className="account-username">{user?.username}</div>
            <div className="account-email">{user?.email}</div>
          </div>
        </motion.div>

        <motion.div
          className="account-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.07 }}
        >
          <div className="account-section-label">Plan</div>
          <div className="account-plan-row">
            <span className={`account-plan-badge account-plan-badge--${plan.toLowerCase()}`}>
              {PLAN_LABELS[plan] ?? plan}
            </span>
            <span className={`account-status account-status--${status.toLowerCase().replace('_', '-')}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
          </div>
          {sub?.currentPeriodEnd && (
            <div className="account-period">
              Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
            </div>
          )}

          {usage && (
            <div className="account-usage">
              <div className="account-usage-row">
                <span>AI draws today</span>
                <span>{usage.aiRequests} / {usage.aiLimit === -1 ? '∞' : usage.aiLimit}</span>
              </div>
              <div className="account-usage-row">
                <span>Saved boards</span>
                <span>{usage.boards} / {usage.boardLimit === -1 ? '∞' : usage.boardLimit}</span>
              </div>
              <div className="account-usage-row">
                <span>Collaborators per room</span>
                <span>up to {usage.collaboratorLimit}</span>
              </div>
            </div>
          )}

          <div className="account-plan-actions">
            {plan !== 'FREE' ? (
              <button
                className="account-btn account-btn--primary"
                onClick={() => void handleManageBilling()}
                disabled={portalLoading}
              >
                {portalLoading ? 'Loading…' : 'Manage Billing'}
              </button>
            ) : (
              <button
                className="account-btn account-btn--upgrade"
                onClick={() => setAppView('pricing')}
              >
                Upgrade Plan
              </button>
            )}
          </div>
        </motion.div>

        <motion.div
          className="account-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.14 }}
        >
          <div className="account-section-label">Session</div>
          <button className="account-btn account-btn--danger" onClick={logout}>
            Sign out
          </button>
        </motion.div>
      </div>
    </div>
  );
}
