import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </BaseIcon>
  );
}

export function CarIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 16 6.8 9.8A2 2 0 0 1 8.7 8.3h6.6a2 2 0 0 1 1.9 1.5L19 16" />
      <path d="M4 16h16v3a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-.7l-.3-1H7.7l-.3 1a1 1 0 0 1-1 .7H5a1 1 0 0 1-1-1v-3Z" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
    </BaseIcon>
  );
}

export function DriversIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
      <path d="M13 19a4 4 0 0 1 7.5-1.8" />
    </BaseIcon>
  );
}

export function ContractsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 3.5h7l4 4V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 12h7" />
      <path d="M8.5 16h5" />
    </BaseIcon>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v2H6.5A2.5 2.5 0 0 0 4 11.5v-4Z" />
      <path d="M4 11.5A2.5 2.5 0 0 1 6.5 9H20v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5v-5Z" />
      <circle cx="16" cy="14" r="1" />
    </BaseIcon>
  );
}

export function PaymentsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
      <path d="M13 15h4" />
    </BaseIcon>
  );
}

export function LedgerIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 4.5h14" />
      <path d="M5 9h14" />
      <path d="M5 13.5h14" />
      <path d="M5 18h14" />
      <path d="M8 4.5v13.5" />
      <path d="M15 4.5v13.5" />
    </BaseIcon>
  );
}

export function FinanceIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v18" />
      <path d="M16.5 7.5c0-1.9-1.9-3.5-4.5-3.5S7.5 5.6 7.5 7.5 9.4 11 12 11s4.5 1.6 4.5 3.5-1.9 3.5-4.5 3.5-4.5-1.6-4.5-3.5" />
    </BaseIcon>
  );
}

export function IncidentIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 9v4.5" />
      <circle cx="12" cy="16.8" r=".8" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 10.5a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </BaseIcon>
  );
}

export function ReportsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 19h16" />
      <path d="M7 15V9" />
      <path d="M12 15V5" />
      <path d="M17 15v-3" />
    </BaseIcon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9.2 12 1.9 1.9 3.7-4.2" />
    </BaseIcon>
  );
}

export function OutboxIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 13.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7" />
      <path d="M4 13.5 8 10l4 3.5L16 10l4 3.5" />
      <path d="M4 20h16" />
    </BaseIcon>
  );
}

export function UsersSettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="m18.8 9 .5 1 .9.2-.8.8.2 1-.8-.4-.9.4.1-1-.7-.8.9-.2.6-1Z" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6Z" />
    </BaseIcon>
  );
}
