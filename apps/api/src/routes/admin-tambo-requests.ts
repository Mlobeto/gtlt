import { Router } from "express";
import { z } from "zod";
import type { TamboRequestStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { validateTamboQuote } from "../lib/tambo-quote.js";
import {
  serializeTamboRequest,
  tamboRequestInclude,
} from "../lib/tambo-request-dto.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Panel de plataforma para DESARROLLADORA: cola de pedidos de tambo,
 * cotización en nombre del proveedor y rechazo. Cross-tenant a
 * propósito — DESARROLLADORA es un rol de plataforma, no de un tenant puntual.
 */
export const adminTamboRequestsRouter = Router();

const statuses: TamboRequestStatus[] = [
  "SENT",
  "QUOTED",
  "ACCEPTED",
  "DECLINED",
  "REJECTED",
  "CANCELLED",
  "CONVERTED",
];

adminTamboRequestsRouter.get(
  "/tambo-requests",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const query = z
      .object({
        status: z.enum(statuses as [TamboRequestStatus, ...TamboRequestStatus[]]).optional(),
        tenantId: z.string().uuid().optional(),
      })
      .safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query", details: query.error.flatten() });
      return;
    }

    const items = await prisma.tamboRequest.findMany({
      where: {
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.tenantId ? { tenantId: query.data.tenantId } : {}),
      },
      include: tamboRequestInclude,
      orderBy: { createdAt: "desc" },
    });

    res.json({ items: items.map(serializeTamboRequest) });
  },
);

adminTamboRequestsRouter.get(
  "/tambo-requests/:id",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const item = await prisma.tamboRequest.findUnique({
      where: { id: idParsed.data },
      include: tamboRequestInclude,
    });
    if (!item) throw new HttpError(404, "Pedido no encontrado");
    res.json({ item: serializeTamboRequest(item) });
  },
);

adminTamboRequestsRouter.patch(
  "/tambo-requests/:id/quote",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const quote = validateTamboQuote(req.body);
    const existing = await prisma.tamboRequest.findUnique({
      where: { id: idParsed.data },
    });
    if (!existing) throw new HttpError(404, "Pedido no encontrado");
    if (existing.status !== "SENT" && existing.status !== "QUOTED") {
      throw new HttpError(409, "Solo se puede cotizar un pedido enviado o ya cotizado.");
    }

    const item = await prisma.tamboRequest.update({
      where: { id: existing.id },
      data: {
        status: "QUOTED",
        quoteItems: quote.quoteItems,
        quoteTotal: quote.quoteTotal,
        quoteCurrency: quote.quoteCurrency,
        quoteValidUntil: quote.quoteValidUntil,
        quoteNotes: quote.quoteNotes,
        quotedById: req.auth!.userId,
        quotedAt: new Date(),
      },
      include: tamboRequestInclude,
    });

    res.json({ item: serializeTamboRequest(item) });
  },
);

adminTamboRequestsRouter.patch(
  "/tambo-requests/:id/reject",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = z
      .object({ reason: z.string().trim().min(1).max(500) })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body", details: body.error.flatten() });
      return;
    }

    const existing = await prisma.tamboRequest.findUnique({
      where: { id: idParsed.data },
    });
    if (!existing) throw new HttpError(404, "Pedido no encontrado");
    if (
      existing.status === "CONVERTED" ||
      existing.status === "CANCELLED" ||
      existing.status === "REJECTED"
    ) {
      throw new HttpError(409, "Este pedido ya no se puede rechazar.");
    }

    const item = await prisma.tamboRequest.update({
      where: { id: existing.id },
      data: { status: "REJECTED", rejectionReason: body.data.reason },
      include: tamboRequestInclude,
    });
    res.json({ item: serializeTamboRequest(item) });
  },
);
