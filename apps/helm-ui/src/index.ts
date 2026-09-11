/**
 * @helm/ui — Public API barrel
 * Import components, hooks, and types from this entry point.
 */

// ─── Components ───────────────────────────────────────────────────────────────
export { LogoMark } from './components/LogoMark';
export type { LogoMarkProps } from './components/LogoMark';

export { Avatar, AvatarPicker, AVATARS, avatarUrl, defaultAvatarForSeed } from './components/Avatar';
export type { AvatarProps, AvatarPickerProps } from './components/Avatar';

export { Wordmark } from './components/Wordmark';
export type { WordmarkProps } from './components/Wordmark';

export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';

export { Card, CardHeader, CardBody, CardFooter } from './components/Card';
export type { CardProps, CardHeaderProps, CardBodyProps, CardFooterProps } from './components/Card';

export { Badge } from './components/Badge';
export type { BadgeProps } from './components/Badge';

export { Input, Textarea } from './components/Input';
export type { InputProps, TextareaProps } from './components/Input';

export { KpiCard } from './components/KpiCard';
export type { KpiCardProps } from './components/KpiCard';

export { AiEmployeeCard } from './components/AiEmployeeCard';
export type { AiEmployeeCardProps, AiAction } from './components/AiEmployeeCard';

export { Sidebar, SIDEBAR_DESKTOP_QUERY } from './components/Sidebar';
export type { SidebarProps, SidebarLabels, NavItem, NavSection, AiEmployeeBadge } from './components/Sidebar';

export { AppShell } from './components/AppShell';
export type { AppShellProps } from './components/AppShell';

// ─── Pack config ────────────────────────────────────────────────────────────────
export type { PackManifest } from './pack';
