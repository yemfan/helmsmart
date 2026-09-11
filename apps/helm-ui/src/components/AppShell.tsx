/**
 * AppShell — Root layout composing the sidebar with a scrollable main content area.
 * The sidebar slot accepts any React node (typically <Sidebar />).
 *
 * At `lg` (1024px) and up the sidebar is a full-height column beside the
 * content. Below it the shell stacks: <Sidebar> renders as a slim top bar
 * with an off-canvas drawer, and the content takes the full width under it.
 */

import React from 'react';
import { SIDEBAR_DESKTOP_QUERY } from './Sidebar';

export interface AppShellProps {
  /** Sidebar content. Pass a <Sidebar /> component. */
  sidebar: React.ReactNode;
  /** Main content. Fills remaining width and scrolls independently. */
  children: React.ReactNode;
  /** Additional class names for the outermost container. */
  className?: string;
}

const APP_SHELL_CSS = `
.helm-app-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--color-background-secondary);
  overflow: hidden;
}
.helm-app-shell__sidebar { flex-shrink: 0; }
.helm-app-shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}
@media ${SIDEBAR_DESKTOP_QUERY} {
  .helm-app-shell { flex-direction: row; height: auto; min-height: 100vh; }
  .helm-app-shell__sidebar { position: sticky; top: 0; height: 100vh; z-index: 40; }
  .helm-app-shell__main { height: 100vh; }
}
`;

export function AppShell({ sidebar, children, className }: AppShellProps) {
  return (
    <>
      <style>{APP_SHELL_CSS}</style>
      <div className={className ? `helm-app-shell ${className}` : 'helm-app-shell'}>
        <div className="helm-app-shell__sidebar">{sidebar}</div>
        <main className="helm-app-shell__main">{children}</main>
      </div>
    </>
  );
}
