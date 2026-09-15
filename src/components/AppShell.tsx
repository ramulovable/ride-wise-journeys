import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandHeader } from "@/components/BrandHeader";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { WhatsAppSupportButton } from "@/components/WhatsAppSupportButton";
import { InstallAppBar } from "@/components/InstallAppBar";

export type NavItem = { to: string; label: string; icon: ReactNode };

export function AppShell({
  title,
  subtitle,
  nav,
  showWhatsAppSupport = false,
  showNotificationBell = false,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  showWhatsAppSupport?: boolean;
  showNotificationBell?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <BrandHeader
        title={title}
        {...(subtitle === undefined ? {} : { subtitle })}
        right={
          <div className="flex items-center gap-1">
            {showNotificationBell ? (
              <Button variant="ghost" size="icon" asChild aria-label="Notifications">
                <Link to="/notifications">
                  <Bell className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {showNotificationBell ? (
              <Link to="/profile" aria-label="My profile">
                <ProfileAvatar path={profile?.photo_url} name={profile?.full_name} size={32} />
              </Link>
            ) : null}
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        }
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-4">{children}</main>

      {showWhatsAppSupport ? <WhatsAppSupportButton /> : null}
      {showWhatsAppSupport ? <InstallAppBar /> : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card">
        <div className="mx-auto flex max-w-3xl overflow-x-auto">
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex min-w-[68px] flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
