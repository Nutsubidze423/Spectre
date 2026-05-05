import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';

export function UsageIndicator() {
  const sub = useBillingStore((s) => s.sub);
  const setAppView = useAuthStore((s) => s.setAppView);

  if (!sub || sub.plan !== 'FREE') return null;

  const used = sub.usage.thinkingPartnerThisMonth;
  const limit = sub.usage.thinkingPartnerLimit;
  const exhausted = limit !== -1 && used >= limit;

  return (
    <button
      className={`usage-indicator${exhausted ? ' usage-indicator--exhausted' : ''}`}
      onClick={() => setAppView('pricing')}
      title="View plans"
    >
      <span className="usage-ai-icon">✦</span>
      <span className="usage-count">
        {used}/{limit === -1 ? '∞' : limit}
      </span>
      <span className="usage-label">Partner/mo</span>
      <span className="usage-upgrade">↑ Upgrade</span>
    </button>
  );
}
