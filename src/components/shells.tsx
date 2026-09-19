import type { ReactNode } from "react";
import {
  Route as RouteIcon,
  Navigation,
  BadgeIndianRupee,
  Bell,
  CalendarClock,
  ClipboardList,
  Gift,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  Settings,
  User,
  Users,
  QrCode,
  UserRound,
  Wallet,
} from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";

const icon = (node: ReactNode) => node;

const customerNav: NavItem[] = [
  { to: "/app", label: "Home", icon: icon(<Home className="h-4 w-4" />) },
  { to: "/app/rides", label: "My Bookings", icon: icon(<ClipboardList className="h-4 w-4" />) },
  { to: "/support", label: "Support", icon: icon(<LifeBuoy className="h-4 w-4" />) },
  { to: "/profile", label: "Profile", icon: icon(<User className="h-4 w-4" />) },
];

const riderNav: NavItem[] = [
  { to: "/rider", label: "Home", icon: icon(<Home className="h-4 w-4" />) },
  { to: "/rider/rides", label: "Bookings", icon: icon(<ClipboardList className="h-4 w-4" />) },
  {
    to: "/rider/earnings",
    label: "Earning",
    icon: icon(<BadgeIndianRupee className="h-4 w-4" />),
  },
  { to: "/profile", label: "Profile", icon: icon(<User className="h-4 w-4" />) },
];

const adminNav: NavItem[] = [
  { to: "/admin", label: "Overview", icon: icon(<LayoutGrid className="h-4 w-4" />) },
  { to: "/admin/customers", label: "Customers", icon: icon(<UserRound className="h-4 w-4" />) },
  { to: "/admin/riders", label: "Drivers", icon: icon(<Users className="h-4 w-4" />) },
  { to: "/admin/catalog", label: "Catalog", icon: icon(<MapPin className="h-4 w-4" />) },
  {
    to: "/admin/vehicle-images",
    label: "Images",
    icon: icon(<ImageIcon className="h-4 w-4" />),
  },
  { to: "/admin/fares", label: "Fares", icon: icon(<BadgeIndianRupee className="h-4 w-4" />) },
  { to: "/admin/rides", label: "Rides", icon: icon(<CalendarClock className="h-4 w-4" />) },
  { to: "/admin/dispatch", label: "Dispatch", icon: icon(<RouteIcon className="h-4 w-4" />) },
  { to: "/admin/live-drivers", label: "Live", icon: icon(<Navigation className="h-4 w-4" />) },
  { to: "/admin/withdrawals", label: "Payouts", icon: icon(<Wallet className="h-4 w-4" />) },
  { to: "/admin/referrals", label: "Referrals", icon: icon(<Gift className="h-4 w-4" />) },
  { to: "/admin/banners", label: "Banners", icon: icon(<ImageIcon className="h-4 w-4" />) },
  { to: "/admin/notifications", label: "Alerts", icon: icon(<Bell className="h-4 w-4" />) },
  { to: "/admin/support", label: "Support", icon: icon(<LifeBuoy className="h-4 w-4" />) },
  { to: "/admin/qr", label: "QR", icon: icon(<QrCode className="h-4 w-4" />) },
  { to: "/admin/settings", label: "Settings", icon: icon(<Settings className="h-4 w-4" />) },
];

export function CustomerShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      nav={customerNav}
      showWhatsAppSupport
      showNotificationBell
    >
      {children}
    </AppShell>
  );
}

export function RiderShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AppShell
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      nav={riderNav}
      showWhatsAppSupport
      showNotificationBell
    >
      {children}
    </AppShell>
  );
}

export function AdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AppShell title={title} {...(subtitle === undefined ? {} : { subtitle })} nav={adminNav}>
      {children}
    </AppShell>
  );
}
