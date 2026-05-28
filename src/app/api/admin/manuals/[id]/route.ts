import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // DB에서 찾기
    const doc = await prisma.manualDocument.findUnique({
      where: { id },
    });

    if (!doc) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    // DB 삭제
    await prisma.manualDocument.delete({
      where: { id },
    });

    // 물리 파일 삭제 (저장된 filePath 기준)
    const filePath = doc.filePath;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/manuals/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
