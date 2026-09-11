/**
 * Sidebar — App navigation shell with logo, nav sections, and AI employee badge.
 * Background is always #080d18 (dark navy) regardless of product vertical.
 * Active state and AI badge use var(--brand) for per-vertical color theming.
 *
 * Presentational by default — nav rows render as <a href>. Host apps can pass
 * `linkComponent` (e.g. the Next.js <Link>) for client-side navigation, plus
 * `notificationsSlot` and `footer` to mount product-specific chrome (a
 * notifications bell, a user menu / sign-out) without forking the component.
 *
 * Responsive: at the `lg` breakpoint (1024px) and up it is the fixed 180px
 * column it always was. Below that it collapses to a slim top bar — menu
 * button, logo, notifications — and the navigation opens as an off-canvas
 * drawer under the bar. The parent must stack it above the content below
 * `lg` (flex-direction: column; see <AppShell>), because the bar is a full-
 * width row there rather than a column.
 *
 * The drawer and the column are the same element, so the notifications slot
 * and the footer are mounted exactly once at every width.
 */

import React from 'react';
import { Wordmark } from './Wordmark';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NavItem {
  /** Display label. */
  label: string;
  /** Navigation href. */
  href: string;
  /** Icon node (Lucide or custom). */
  icon?: React.ReactNode;
  /** Optional numeric badge (e.g. unread count). */
  badge?: number;
}

export interface NavSection {
  /** Optional section heading text. */
  label?: string;
  /** Nav items in this section. */
  items: NavItem[];
}

export interface AiEmployeeBadge {
  /**
   * Display name, e.g. "Mark, AI COO". Rendered as a static label — the pill
   * makes no claim about what the employee is doing right now.
   */
  name: string;
}

/** Accessible names for the shell's own controls, in the reader's language. */
export interface SidebarLabels {
  /** aria-label of the <nav>. Default 'Main navigation'. */
  navigation?: string;
  /** Menu button while the drawer is closed. Default 'Open menu'. */
  openMenu?: string;
  /** Menu button while the drawer is open. Default 'Close menu'. */
  closeMenu?: string;
}

export interface SidebarProps {
  /** Product name shown in the wordmark, e.g. 'HelmSmart'. */
  productName: string;
  /** Letter shown in the logo mark, e.g. 'H', 'R'. */
  logoLetter: string;
  /**
   * Where the logo links. Defaults to '/'. Authed apps should pass their
   * dashboard home (e.g. '/home') so clicking the logo doesn't bounce a
   * signed-in user out to the public marketing site.
   */
  logoHref?: string;
  /** Ordered navigation sections. */
  sections: NavSection[];
  /** Href of the currently active route (matched to NavItem.href). */
  activeHref?: string;
  /** AI employee pill rendered at the bottom of the sidebar. */
  aiEmployee?: AiEmployeeBadge;
  /** Additional class names for the root element. */
  className?: string;
  /**
   * Element used to render each nav row. Defaults to 'a' (full-page nav).
   * Pass the Next.js <Link> for client-side routing; it receives `href`,
   * `style`, `aria-current`, and mouse handlers.
   */
  linkComponent?: React.ElementType;
  /** Optional node rendered in the logo header (e.g. a notifications bell). */
  notificationsSlot?: React.ReactNode;
  /** Optional node rendered at the very bottom (e.g. a user menu / sign-out). */
  footer?: React.ReactNode;
  /** Accessible names for the menu button and the nav landmark. */
  labels?: SidebarLabels;
}

// ─── Responsive styles ────────────────────────────────────────────────────────

/** Tailwind's `lg`. Below it the sidebar is a top bar + drawer. */
export const SIDEBAR_DESKTOP_QUERY = '(min-width: 1024px)';

const BAR_HEIGHT = 56;

/*
 * Layout lives in a stylesheet rather than inline styles because it changes
 * at a breakpoint, and inline styles cannot hold a media query. Colours stay
 * inline. Mobile first; the `lg` block restores the desktop column exactly.
 */
const SIDEBAR_CSS = `
.helm-sidebar {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  flex-shrink: 0;
  width: 100%;
  height: ${BAR_HEIGHT}px;
  background: #080d18;
}
.helm-sidebar__header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 0 12px 0 6px;
}
.helm-sidebar__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
}
.helm-sidebar__toggle:hover { background: rgba(255,255,255,0.06); color: #ffffff; }
.helm-sidebar__toggle:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.helm-sidebar__slot { margin-left: auto; display: flex; align-items: center; }
.helm-sidebar__overlay {
  position: fixed;
  inset: ${BAR_HEIGHT}px 0 0 0;
  z-index: 60;
  background: rgba(8,13,24,0.55);
  opacity: 0;
  visibility: hidden;
  transition: opacity 200ms ease, visibility 0s linear 200ms;
}
.helm-sidebar__drawer {
  position: fixed;
  top: ${BAR_HEIGHT}px;
  bottom: 0;
  left: 0;
  z-index: 61;
  width: min(288px, 85vw);
  display: flex;
  flex-direction: column;
  background: #080d18;
  border-top: 1px solid rgba(255,255,255,0.06);
  overscroll-behavior: contain;
  visibility: hidden;
  transform: translateX(-100%);
  transition: transform 220ms ease, visibility 0s linear 220ms;
}
.helm-sidebar[data-open="true"] .helm-sidebar__overlay {
  opacity: 1;
  visibility: visible;
  transition: opacity 200ms ease;
}
/* transform: none (not translateX(0)) once open, so position: fixed dialogs
   mounted inside the drawer (account menu modals) stay viewport-relative. */
.helm-sidebar[data-open="true"] .helm-sidebar__drawer {
  visibility: visible;
  transform: none;
  transition: transform 220ms ease;
}
.helm-sidebar__link { padding: 11px 12px 11px 14px; }
@media (prefers-reduced-motion: reduce) {
  .helm-sidebar__overlay,
  .helm-sidebar__drawer,
  .helm-sidebar[data-open="true"] .helm-sidebar__overlay,
  .helm-sidebar[data-open="true"] .helm-sidebar__drawer { transition: none; }
}
@media ${SIDEBAR_DESKTOP_QUERY} {
  .helm-sidebar {
    flex-direction: column;
    width: 180px;
    min-width: 180px;
    max-width: 180px;
    height: 100vh;
    overflow: hidden;
  }
  .helm-sidebar__header {
    flex: none;
    justify-content: space-between;
    padding: 18px 14px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .helm-sidebar__toggle,
  .helm-sidebar__overlay { display: none; }
  .helm-sidebar__slot { margin-left: 0; }
  .helm-sidebar__drawer,
  .helm-sidebar[data-open="true"] .helm-sidebar__drawer {
    position: static;
    z-index: auto;
    width: auto;
    flex: 1;
    min-height: 0;
    border-top: 0;
    visibility: visible;
    transform: none;
    transition: none;
  }
  .helm-sidebar__link { padding: 6px 12px 6px 14px; }
}
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavItemRow({
  item,
  isActive,
  linkComponent,
}: {
  item: NavItem;
  isActive: boolean;
  linkComponent?: React.ElementType;
}) {
  const [hovered, setHovered] = React.useState(false);
  const LinkComponent: React.ElementType = linkComponent ?? 'a';

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 'var(--radius-md)',
    textDecoration: 'none',
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#ffffff' : hovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
    background: isActive
      ? 'rgba(255,255,255,0.08)'
      : hovered
      ? 'rgba(255,255,255,0.04)'
      : 'transparent',
    borderLeft: isActive
      ? '2px solid var(--brand)'
      : '2px solid transparent',
    marginLeft: -2,
    transition: `color var(--duration-fast) var(--ease-standard),
                 background var(--duration-fast) var(--ease-standard)`,
    cursor: 'pointer',
    letterSpacing: '-0.01em',
  };

  const iconStyle: React.CSSProperties = {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    opacity: isActive ? 1 : 0.7,
    color: isActive ? 'var(--brand)' : 'inherit',
  };

  return (
    <LinkComponent
      href={item.href}
      className="helm-sidebar__link"
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={isActive ? 'page' : undefined}
    >
      {item.icon && <span style={iconStyle}>{item.icon}</span>}
      <span style={{ flex: 1 }}>{item.label}</span>
      {typeof item.badge === 'number' && item.badge > 0 && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            background: 'var(--brand)',
            color: '#ffffff',
            borderRadius: 999,
            padding: '1px 5px',
            lineHeight: 1.5,
            minWidth: 16,
            textAlign: 'center',
          } as React.CSSProperties}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </LinkComponent>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'block',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.28)',
        padding: '10px 14px 4px',
        fontFamily: 'var(--font-sans)',
        userSelect: 'none',
      } as React.CSSProperties}
    >
      {label}
    </span>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </>
      )}
    </svg>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Reachable with Tab right now: not tabindex=-1, rendered, and not hidden. */
function isTabbable(el: HTMLElement): boolean {
  if (el.tabIndex < 0) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({
  productName,
  logoLetter,
  logoHref = '/',
  sections,
  activeHref,
  aiEmployee,
  className,
  linkComponent,
  notificationsSlot,
  footer,
  labels,
}: SidebarProps) {
  // Logo links through the same client-side router as the nav rows (falls back
  // to a plain <a>), so a signed-in user stays in the app instead of full-page
  // navigating to the marketing site.
  const LogoLink: React.ElementType = linkComponent ?? 'a';
  const [open, setOpen] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const drawerId = `${React.useId()}-drawer`;

  // Escape, the overlay and the menu button all hand focus back to the button
  // that opened the drawer, so keyboard and screen-reader users land where
  // they started instead of on a link that just became hidden.
  const close = React.useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  // A route change is a navigation: the drawer has done its job.
  React.useEffect(() => {
    setOpen(false);
  }, [activeHref]);

  // Growing past `lg` turns the drawer back into the column; don't leave the
  // page scroll-locked behind a drawer that no longer exists.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(SIDEBAR_DESKTOP_QUERY);
    const onChange = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;

    // Move focus into the drawer.
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    // Lock the page behind it.
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab' || !drawer) return;
      // Keep Tab inside the menu button + drawer while it is open.
      const items = [
        toggleRef.current,
        ...Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE)),
      ].filter((el): el is HTMLElement => !!el && isTabbable(el));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && items.includes(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root.style.overflow = prevOverflow;
    };
  }, [open, close]);

  // Following any link in the drawer closes it — including the link to the
  // page you are already on, which never changes `activeHref`.
  const onDrawerClick = (e: React.MouseEvent) => {
    if (open && (e.target as HTMLElement).closest?.('a[href]')) setOpen(false);
  };

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <nav
        className={className ? `helm-sidebar ${className}` : 'helm-sidebar'}
        aria-label={labels?.navigation ?? 'Main navigation'}
        data-open={open ? 'true' : 'false'}
      >
        {/* Logo area — the top bar below `lg` */}
        <div className="helm-sidebar__header">
          <button
            ref={toggleRef}
            type="button"
            className="helm-sidebar__toggle"
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={open ? labels?.closeMenu ?? 'Close menu' : labels?.openMenu ?? 'Open menu'}
            onClick={() => (open ? close() : setOpen(true))}
          >
            <MenuIcon open={open} />
          </button>
          <LogoLink href={logoHref} style={{ display: 'inline-flex', textDecoration: 'none', minWidth: 0 }}>
            <Wordmark
              letter={logoLetter}
              productName={productName}
              size={24}
              variant="white"
            />
          </LogoLink>
          {notificationsSlot && <div className="helm-sidebar__slot">{notificationsSlot}</div>}
        </div>

        <div className="helm-sidebar__overlay" aria-hidden="true" onClick={close} />

        {/* Nav, AI pill and footer — the column at `lg`, the drawer below it */}
        <div id={drawerId} ref={drawerRef} className="helm-sidebar__drawer" onClick={onDrawerClick}>
          {/* Nav sections */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '8px 6px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.1) transparent',
            } as React.CSSProperties}
          >
            {sections.map((section, si) => (
              <div key={si}>
                {section.label && <SectionLabel label={section.label} />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {section.items.map((item) => (
                    <NavItemRow
                      key={item.href}
                      item={item}
                      isActive={activeHref === item.href}
                      linkComponent={linkComponent}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* AI Employee badge — a static label. It used to carry a pulsing
              "active" dot hard-wired on, which claimed activity nothing measured. */}
          {aiEmployee && (
            <div
              style={{
                padding: '10px 12px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.60)',
                  fontFamily: 'var(--font-sans)',
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                } as React.CSSProperties}
              >
                {aiEmployee.name}
              </div>
            </div>
          )}

          {/* Footer slot (e.g. user menu / sign-out) */}
          {footer && (
            <div
              style={{
                padding: '10px 12px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
