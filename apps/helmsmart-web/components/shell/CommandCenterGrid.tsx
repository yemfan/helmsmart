"use client";

/**
 * CommandCenterGrid — The HelmSmart Command Center dashboard layout.
 *
 * Renders:
 * 1. Top alerts rail (dismissible, severity-colored)
 * 2. 11-node DNA grid — each node is a business module card with status + 3 KPIs
 * 3. AI COO briefing panel (right side or bottom depending on viewport)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, KpiCard, LogoMark } from '@helm/ui';
import type { KpiCardProps } from '@helm/ui';
import { AlertTriangle, Info, XCircle, X, ChevronRight } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeStatus = 'ok' | 'attention' | 'critical' | 'unconfigured';

export interface DnaNode {
  /** Unique identifier for this node. */
  id: string;
  /** Module display name, already in the reader's language. */
  label: string;
  /** Health / configuration status of this module. */
  status: NodeStatus;
  /** Up to 3 headline KPIs shown inside the node card. */
  kpis: KpiCardProps[];
  /** When provided, clicking the node card navigates here. */
  drillHref?: string;
}

export interface Alert {
  /** Unique alert id. */
  id: string;
  /** Alert severity level. */
  severity: 'info' | 'warn' | 'critical';
  /** Source module name, already in the reader's language. */
  module: string;
  /** Short alert title, already in the reader's language. */
  title: string;
  /** Optional deeplink for full detail. */
  href?: string;
}

export interface CommandCenterGridProps {
  /** The 11 business module nodes to render in the grid. */
  nodes: DnaNode[];
  /** Top-of-page alert rail entries. Displayed in severity order. */
  topAlerts?: Alert[];
  /** AI COO's daily briefing text, already in the reader's language. */
  briefing?: string;
  /** Active time window for KPI data. */
  window?: 'today' | 'mtd' | 'qtd' | 'ytd';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<NodeStatus, string> = {
  ok: '#16a34a',
  attention: '#d97706',
  critical: '#dc2626',
  unconfigured: 'var(--color-text-tertiary)',
};

const STATUS_BG: Record<NodeStatus, string> = {
  ok: '#f0fdf4',
  attention: '#fffbeb',
  critical: '#fef2f2',
  unconfigured: 'var(--color-background-secondary)',
};

const ALERT_COLORS = {
  info: { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1', icon: Info },
  warn: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: AlertTriangle },
  critical: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: XCircle },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AlertRail({
  alerts,
  onDismiss,
}: {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation('home');
  if (alerts.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {alerts.map((alert) => {
        const cfg = ALERT_COLORS[alert.severity];
        const Icon = cfg.icon;
        return (
          <div
            key={alert.id}
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 14px',
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              borderRadius: 'var(--radius-md)',
              color: cfg.text,
            } as React.CSSProperties}
          >
            <Icon size={15} style={{ flexShrink: 0 }} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif',
                flexShrink: 0,
              }}
            >
              {alert.module}
            </span>
            <span
              style={{
                fontSize: 12,
                fontFamily: 'Inter, system-ui, sans-serif',
                flex: 1,
              }}
            >
              {alert.title}
            </span>
            {alert.href && (
              <a
                href={alert.href}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: cfg.text,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                {t('grid.alertView')} <ChevronRight size={12} />
              </a>
            )}
            <button
              onClick={() => onDismiss(alert.id)}
              aria-label={t('grid.dismissAlert')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                color: cfg.text,
                opacity: 0.6,
                flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: NodeStatus }) {
  const { t } = useTranslation('home');
  return (
    <span
      title={t(`grid.status.${status}`)}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: STATUS_COLOR[status],
        flexShrink: 0,
      } as React.CSSProperties}
    />
  );
}

function DnaNodeCard({ node }: { node: DnaNode }) {
  const [hovered, setHovered] = React.useState(false);

  const cardStyle: React.CSSProperties = {
    background: hovered && node.drillHref
      ? STATUS_BG[node.status]
      : 'var(--color-background-primary)',
    border: `1px solid color-mix(in srgb, ${STATUS_COLOR[node.status]} 20%, var(--color-border-tertiary))`,
    borderRadius: 'var(--radius-lg)',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: hovered && node.drillHref ? 'var(--shadow-floating)' : 'var(--shadow-raised)',
    transform: hovered && node.drillHref ? 'translateY(-1px)' : 'none',
    transition: `box-shadow var(--duration-base) var(--ease-standard),
                 transform var(--duration-base) var(--ease-standard),
                 background var(--duration-base) var(--ease-standard)`,
    cursor: node.drillHref ? 'pointer' : 'default',
    textDecoration: 'none',
    color: 'inherit',
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <StatusDot status={node.status} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '-0.01em',
          flex: 1,
        } as React.CSSProperties}
      >
        {node.label}
      </span>
      {node.drillHref && (
        <ChevronRight
          size={13}
          style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
        />
      )}
    </div>
  );

  const kpisEl = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {node.kpis.slice(0, 3).map((kpi, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              flexShrink: 0,
            } as React.CSSProperties}
          >
            {kpi.label}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: kpi.value === null ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
              fontFamily: 'Inter, system-ui, sans-serif',
              letterSpacing: '-0.02em',
            } as React.CSSProperties}
          >
            {kpi.value === null ? '—' : `${kpi.value}${kpi.unit ?? ''}`}
          </span>
        </div>
      ))}
    </div>
  );

  const inner = (
    <>
      {header}
      {kpisEl}
    </>
  );

  if (node.drillHref) {
    return (
      <a
        href={node.drillHref}
        style={cardStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {inner}
      </a>
    );
  }

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {inner}
    </div>
  );
}

function BriefingPanel({
  briefing,
  window: win,
}: {
  briefing?: string;
  window?: CommandCenterGridProps['window'];
}) {
  const { t } = useTranslation('home');
  if (!briefing) return null;

  return (
    <div
      style={{
        background: 'color-mix(in srgb, var(--brand) 5%, var(--color-background-primary))',
        border: '1px solid color-mix(in srgb, var(--brand) 20%, var(--color-border-tertiary))',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LogoMark letter="H" size={18} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--brand)',
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          } as React.CSSProperties}
        >
          {t('grid.cooBriefing')}
        </span>
        {win && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              fontFamily: 'Inter, system-ui, sans-serif',
            } as React.CSSProperties}
          >
            {t(`grid.window.${win}`)}
          </span>
        )}
      </div>

      {/* Message */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: 'var(--color-text-secondary)',
          fontFamily: 'Inter, system-ui, sans-serif',
          margin: 0,
        } as React.CSSProperties}
      >
        {briefing}
      </p>
    </div>
  );
}

// ─── CommandCenterGrid ────────────────────────────────────────────────────────

export function CommandCenterGrid({
  nodes,
  topAlerts = [],
  briefing,
  window: win = 'mtd',
}: CommandCenterGridProps) {
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  const visibleAlerts = topAlerts
    .filter((a) => !dismissedIds.has(a.id))
    .sort((a, b) => {
      const order = { critical: 0, warn: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

  function dismiss(id: string) {
    setDismissedIds((prev) => new Set([...prev, id]));
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '20px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      } as React.CSSProperties}
    >
      {/* Alerts */}
      <AlertRail alerts={visibleAlerts} onDismiss={dismiss} />

      {/* Grid + briefing — the briefing sits beside the nodes only once
          there is room for four node columns next to it (xl); below that
          it stacks under them. */}
      <div
        className={`grid grid-cols-1 items-start gap-4 ${briefing ? 'xl:grid-cols-[minmax(0,1fr)_280px]' : ''}`}
      >
        {/* Node grid — 1 column on a phone, 2 on a tablet, 4 at xl */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {nodes.map((node) => (
            <DnaNodeCard key={node.id} node={node} />
          ))}
        </div>

        {/* Briefing panel */}
        {briefing && (
          <div className="xl:sticky xl:top-5">
            <BriefingPanel briefing={briefing} window={win} />
          </div>
        )}
      </div>
    </div>
  );
}
