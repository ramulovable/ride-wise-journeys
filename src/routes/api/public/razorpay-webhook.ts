import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const signature = request.headers.get("x-razorpay-signature");
        const body = await request.text();
        if (!signature) return new Response("Missing signature", { status: 401 });
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(signature, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: unknown;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        const parsed = z
          .object({
            event: z.string(),
            payload: z.object({
              payment: z.object({
                entity: z.object({
                  id: z.string(),
                  order_id: z.string().optional(),
                  amount: z.number().optional(),
                  status: z.string().optional(),
                  notes: z.record(z.string(), z.unknown()).optional(),
                }),
              }),
            }),
          })
          .safeParse(event);
        if (!parsed.success) return Response.json({ ok: true, ignored: true });
        const pay = parsed.data.payload.payment.entity;
        const kind = parsed.data.event;
        if (kind !== "payment.captured" && kind !== "payment.failed") {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin;

        const uuidLike = /^[0-9a-f-]{36}$/i;
        type Ticket = { id: string; payment_status: string; total_amount: number };
        const fetchTicket = async (col: string, val: string): Promise<Ticket | null> => {
          const { data } = await db.from("etickets").select("id,payment_status,total_amount").eq(col, val).maybeSingle();
          return (data ?? null) as unknown as Ticket | null;
        };
        const noteTicketId = typeof pay.notes?.["ticket_id"] === "string" ? pay.notes?.["ticket_id"] : null;
        const ticket: Ticket | null = noteTicketId && uuidLike.test(noteTicketId)
          ? await fetchTicket("id", noteTicketId)
          : pay.order_id
            ? await fetchTicket("payment_order_id", pay.order_id)
            : null;
        if (!ticket) return Response.json({ ok: true, unknown_ticket: true });

        if (kind === "payment.captured") {
          // Amount must match the stored ticket total (paise).
          const expectedAmount = Math.round(Number(ticket.total_amount) * 100);
          if (typeof pay.amount === "number" && pay.amount !== expectedAmount) {
            console.error("razorpay webhook amount mismatch", ticket.id, pay.amount, expectedAmount);
            await db
              .from("etickets")
              .update({ payment_status: "FAILED" })
              .eq("id", ticket.id)
              .eq("payment_status", "PENDING");
            return Response.json({ ok: true, amount_mismatch: true });
          }
          // Idempotent: only transitions PENDING -> PAID.
          const { data: updated, error } = await db
            .from("etickets")
            .update({
              payment_status: "PAID",
              status: "ACTIVE",
              payment_id: pay.id,
              paid_at: new Date().toISOString(),
            })
            .eq("id", ticket.id)
            .eq("payment_status", "PENDING")
            .select("id")
            .maybeSingle();
          if (error) console.error("webhook update failed", error.message);
          return Response.json({ ok: true, applied: Boolean(updated) });
        }

        // payment.failed
        if (ticket.payment_status === "PENDING") {
          await db.from("etickets").update({ payment_status: "FAILED" }).eq("id", ticket.id);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
