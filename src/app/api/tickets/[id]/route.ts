import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();

    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.resolutionComment) updateData.resolutionComment = data.resolutionComment;
    if (data.resolverName) updateData.resolverName = data.resolverName;
    if (data.resolvedAt) updateData.resolvedAt = new Date(data.resolvedAt);

    const updatedTicket = await prisma.ticket.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedTicket);
  } catch (error) {
    console.error(`PATCH /api/tickets/[id] error:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.ticket.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/tickets/[id] error:`, error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
