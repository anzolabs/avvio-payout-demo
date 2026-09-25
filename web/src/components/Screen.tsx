import { ReactNode } from 'react';

/**
 * A phone screen: a body that scrolls and a footer pinned to the bottom for
 * the primary action. Every screen renders through this so the layout rule
 * lives in one place.
 */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="body">{children}</div>
      {footer && <div className="footer">{footer}</div>}
    </>
  );
}

export function BackLink({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="back" onClick={onClick} disabled={disabled}>Back</button>;
}
