import type { ReactNode } from 'react';
import { Database, MapPinned, RadioTower, UserRound, Waves } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

type Props = {
  activeStep: number;
  children: ReactNode;
  userLabel?: string;
  planLabel?: string;
};

const steps = [
  { label: 'Account', icon: UserRound },
  { label: 'Station', icon: MapPinned },
  { label: 'Data provider', icon: RadioTower },
  { label: 'Verify', icon: Database },
];

export function AppShell({ activeStep, children, userLabel, planLabel }: Props) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandLogo variant="white" className="sidebar-logo-full" />
          <BrandLogo variant="icon" className="sidebar-logo-icon" />
          {/*<span>NEW APP</span>*/}
        </div>

        <div className="sidebar-section-title">Setup</div>
        <nav className="setup-nav">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.label}
                className={`setup-nav-item ${index === activeStep ? 'active' : ''} ${index < activeStep ? 'complete' : ''}`}
              >
                <div className="setup-nav-icon"><Icon size={17} /></div>
                <span>{step.label}</span>
                <span className="step-number">{index + 1}</span>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="future-card">
            <Waves size={18} />
            <div>
              <strong>Forecast layer</strong>
              <span>Next after setup validation</span>
            </div>
          </div>
          {userLabel && (
            <div className="user-summary">
              <div className="avatar">{userLabel.charAt(0).toUpperCase()}</div>
              <div>
                <strong>{userLabel}</strong>
                <span>{planLabel ?? 'Local'}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
