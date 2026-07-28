/** Application-wide constants */

export const APP_NAME = 'Coldingrod';
export const APP_DESCRIPTION = 'AI-Powered Business Operating System for Digital Agencies';

/** Sidebar navigation items */
export const NAV_ITEMS = [
  { label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
  { label: 'Projects', icon: 'account_tree', href: '/projects' },
  { label: 'Clients', icon: 'groups', href: '/clients' },
  { label: 'Finance', icon: 'payments', href: '/finance' },
  { label: 'Team', icon: 'badge', href: '/team' },
  { label: 'Settings', icon: 'settings', href: '/settings' },
] as const;

/** Sidebar footer items */
export const NAV_FOOTER_ITEMS = [
  { label: 'AI Hub', icon: 'smart_toy', href: '/ai-hub' },
  { label: 'Help Center', icon: 'help', href: '/help' },
] as const;

/** Workspace member roles */
export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Onboarding steps */
export const ONBOARDING_STEPS = [
  { id: 'profile', label: 'Profile', path: '/onboarding/profile' },
  { id: 'company', label: 'Company', path: '/onboarding/company' },
  { id: 'workspace', label: 'Workspace', path: '/onboarding/workspace' },
  { id: 'invite', label: 'Invite Team', path: '/onboarding/invite' },
  { id: 'success', label: 'Success', path: '/onboarding/success' },
] as const;

/** Responsive breakpoints (matching Stitch) */
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1440,
} as const;
