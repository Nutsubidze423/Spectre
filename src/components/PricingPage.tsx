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
    color: '#6b6b8a',
    features: [
      '3 saved boards',
      'Multiplayer up to 3 users',
      'Basic AI drawing — no restrictions',
      'Thinking Partner (5 sessions/month)',
    ],
  },
  {
    id: 'SOLO' as const,
    label: 'Solo',
    price: '$9',
    period: '/month',
    color: '#7c6af7',
    highlighted: true,
    features: [
      'Unlimited boards',
      'Multiplayer up to 5 users',
      'Thinking Partner (unlimited)',
      'Canvas Memory (last 30 sessions)',
      'Challenge Thinking (10/day)',
      'Session Summary export',
    ],
  },
  {
    id: 'PRO' as const,
    label: 'Pro',
    price: '$19',
    period: '/month',
    color: '#6ab8f7',
    features: [
      'Everything in Solo',
      'Multiplayer up to 15 users',
      'Unlimited Canvas Memory',
      'Unlimited Challenge Thinking',
      'Explain Mode + replayable animations',
      'Guest view links (share without account)',
    ],
  },
  {
    id: 'TEAM' as const,
    label: 'Team',
    price: '$49',
    period: '/month',
    color: '#6af7c8',
    features: [
      'Everything in Pro (up to 10 seats)',
      'Multiplayer up to 50 users',
      'Shared Team Canvas Memory',
      'Session Summary with contributor attribution',
      'Admin dashboard — usage & member management',
      '$6/seat after 10',
    ],
  },
];

function openPaddleCheckout(transactionId: string) {
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

  const currentPlan = sub?.plan ?? 'FREE';

  async function handleUpgrade(planId: 'SOLO' | 'PRO' | 'TEAM') {
    setLoading(planId);
    const transactionId = await createCheckoutSession(planId);
    setLoading(null);
    if (transactionId) openPaddleCheckout(transactionId);
  }

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <button className="pricing-back" onClick={() => setAppView('boards')}>← Back</button>
        <h1 className="pricing-title">Choose your plan</h1>
        <p className="pricing-subtitle">Every plan includes real-time multiplayer collaboration.</p>
      </div>

      <div className="pricing-grid pricing-grid--4">
        {PLANS.map((plan, i) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <motion.div
              key={plan.id}
              className={`pricing-card${plan.highlighted ? ' pricing-card--pro' : ''}${isCurrent ? ' pricing-card--current' : ''}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.32, ease: 'easeOut' }}
            >
              {plan.highlighted && <div className="pricing-badge">Most Popular</div>}
              {isCurrent && <div className="pricing-badge pricing-badge--current">Current Plan</div>}

              <div className="pricing-plan-name" style={{ color: plan.color }}>{plan.label}</div>
              <div className="pricing-price">
                <span className="pricing-price-amount">{plan.price}</span>
                <span className="pricing-price-period">{plan.period}</span>
              </div>
              <ul className="pricing-features">
                {plan.features.map((f) => (
                  <li key={f} className="pricing-feature">
                    <span className="pricing-check" style={{ color: plan.color }}>✓</span>
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
                  className={`pricing-btn pricing-btn--${plan.id.toLowerCase()}`}
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
