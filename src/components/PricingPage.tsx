import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useBillingStore } from '../store/billingStore';
import { getPaddle } from '../lib/paddle';

const PLANS = [
  {
    id: 'FREE' as const,
    label: 'Free',
    price: '$0',
    period: 'forever',
    features: [
      '3 saved boards',
      '3 AI draws / day',
      '5 collaborators per room',
    ],
  },
  {
    id: 'PRO' as const,
    label: 'Pro',
    price: '$12',
    period: 'per month',
    features: [
      'Unlimited boards',
      '20 AI draws / day',
      '20 collaborators per room',
    ],
    highlighted: true,
  },
  {
    id: 'TEAM' as const,
    label: 'Team',
    price: '$39',
    period: 'per month',
    features: [
      'Unlimited boards',
      '60 AI draws / day',
      '50 collaborators per room',
    ],
  },
];

function openCheckout(transactionId: string) {
  getPaddle()?.Checkout.open({
    transactionId,
    eventCallback: (data) => {
      if ((data as { name: string }).name === 'checkout.completed') {
        setTimeout(() => void useBillingStore.getState().fetchSubscription(), 2000);
      }
    },
  });
}

export function PricingPage() {
  const setAppView = useAuthStore((s) => s.setAppView);
  const sub = useBillingStore((s) => s.sub);
  const createCheckoutSession = useBillingStore((s) => s.createCheckoutSession);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(planId: 'PRO' | 'TEAM') {
    setLoading(planId);
    const transactionId = await createCheckoutSession(planId);
    setLoading(null);
    if (transactionId) openCheckout(transactionId);
  }

  const currentPlan = sub?.plan ?? 'FREE';

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <button className="pricing-back" onClick={() => setAppView('boards')}>
          ← Back
        </button>
        <h1 className="pricing-title">Choose your plan</h1>
        <p className="pricing-subtitle">Scale with your team.</p>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan, i) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <motion.div
              key={plan.id}
              className={`pricing-card${plan.highlighted ? ' pricing-card--pro' : ''}${isCurrent ? ' pricing-card--current' : ''}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: 'easeOut' }}
            >
              {plan.highlighted && (
                <div className="pricing-badge">Most Popular</div>
              )}
              {isCurrent && (
                <div className="pricing-badge pricing-badge--current">Current Plan</div>
              )}
              <div className="pricing-plan-name">{plan.label}</div>
              <div className="pricing-price">
                <span className="pricing-price-amount">{plan.price}</span>
                <span className="pricing-price-period">{plan.period}</span>
              </div>
              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f} className="pricing-feature">
                    <span className="pricing-check">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {plan.id === 'FREE' ? (
                <button className="pricing-btn pricing-btn--free" disabled>
                  {isCurrent ? 'Current plan' : 'Free forever'}
                </button>
              ) : (
                <button
                  className={`pricing-btn${plan.highlighted ? ' pricing-btn--pro' : ' pricing-btn--team'}`}
                  disabled={isCurrent || loading === plan.id}
                  onClick={() => void handleUpgrade(plan.id)}
                >
                  {loading === plan.id ? 'Loading…' : isCurrent ? 'Current plan' : `Upgrade to ${plan.label}`}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="pricing-payment-methods">
        <span className="pricing-payment-label">Secure payments via</span>
        <div className="pricing-payment-icons">
          <span className="payment-badge">Visa</span>
          <span className="payment-badge">Mastercard</span>
          <span className="payment-badge">Apple Pay</span>
          <span className="payment-badge">Google Pay</span>
          <span className="payment-badge">PayPal</span>
        </div>
      </div>
    </div>
  );
}
