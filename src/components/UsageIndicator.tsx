import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';

export function UsageIndicator() {
  const sub = useBillingStore((s) => s.sub);
  const setAppView = useAuthStore((s) => s.setAppView);

  if (!sub || sub.plan !== 'FREE') return null;

  const { aiRequests, aiLimit } = sub.usage;
  const exhausted = aiLimit !== -1 && aiRequests >= aiLimit;

  return (
    <button
      className={`usage-indicator${exhausted ? ' usage-indicator--exhausted' : ''}`}
      onClick={() => setAppView('pricing')}
      title="View plans"
    >
      <span className="usage-ai-icon">✦</span>
      <span className="usage-count">
        {aiRequests}/{aiLimit === -1 ? '∞' : aiLimit}
      </span>
      <span className="usage-label">AI today</span>
      <span className="usage-upgrade">↑ Upgrade</span>
    </button>
  );
}
