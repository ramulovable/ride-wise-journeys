import { Button } from "@/components/ui/button";
import { DEFAULT_SUPPORT_PHONE, useAppSettings, whatsappLink } from "@/lib/settings";

export function WhatsAppSupportButton() {
  const settings = useAppSettings();
  const supportUrl = whatsappLink(settings.data?.supportPhone ?? DEFAULT_SUPPORT_PHONE);
  return (
    <Button
      asChild
      size="icon"
      className="fixed bottom-20 right-4 z-40 size-12 rounded-full bg-whatsapp text-whatsapp-foreground shadow-lg hover:bg-whatsapp/90 focus-visible:ring-whatsapp sm:right-6"
    >
      <a
        href={supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contact Shahin Travels support on WhatsApp"
        title="WhatsApp support"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" className="size-6 fill-current">
          <path d="M16.04 3a12.8 12.8 0 0 0-10.9 19.5L3.3 29l6.65-1.75A12.8 12.8 0 1 0 16.04 3Zm0 23.43c-1.9 0-3.75-.5-5.38-1.44l-.39-.23-3.95 1.04 1.06-3.85-.25-.4a10.62 10.62 0 1 1 8.91 4.88Zm5.82-7.95c-.32-.16-1.88-.93-2.17-1.04-.29-.1-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.57a9.57 9.57 0 0 1-1.77-2.2c-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.54-.71-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.07 1.3 3.28c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.46.21 2.01.13.61-.09 1.88-.77 2.14-1.51.26-.74.26-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z" />
        </svg>
      </a>
    </Button>
  );
}
