import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const uploadsDirectory = process.env.MANUAL_UPLOADS_DIR || path.join(process.cwd(), "uploads/manuals");

export async function GET(request: NextRequest) {
  try {
    const documents = await prisma.manualDocument.findMany({
      orderBy: { createdAt: "desc" },
    });

    // 프론트엔드 하위 호환성을 위해 필드 매핑 리턴
    const mapped = documents.map((doc) => ({
      id: doc.id,
      fileName: doc.filename,
      title: doc.originalName,
      category: doc.category,
      description: doc.description,
      status: doc.parsedStatus,
      errorMessage: doc.parseError,
      createdAt: doc.createdAt,
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error("GET /api/admin/manuals error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const category = formData.get("category") as string;
    const description = formData.get("description") as string;

    if (!file || !title || !category || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 파일 이름 고유하게 생성
    const sanitizedFileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(uploadsDirectory, sanitizedFileName);

    // 디렉토리가 없으면 생성
    if (!fs.existsSync(uploadsDirectory)) {
      fs.mkdirSync(uploadsDirectory, { recursive: true });
    }

    // 파일 저장
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    let parsedStatus = "success";
    let parseError = null;
    let extractedText = "";

    try {
      // PDF 파싱 검증 및 텍스트 추출 수행
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text || "";
      if (extractedText.trim().length === 0) {
        throw new Error("PDF에서 텍스트 콘텐츠를 추출할 수 없습니다.");
      }
    } catch (parseErr: any) {
      console.error("[PDF Parse Verification Failed]:", parseErr);
      parsedStatus = "failed";
      parseError = parseErr.message || "PDF 파싱 실패 (스캔된 이미지이거나 손상된 파일)";
    }

    // DB 기록 (ManualDocument 신규 모델 활용)
    const doc = await prisma.manualDocument.create({
      data: {
        filename: sanitizedFileName,
        originalName: title,
        category,
        description,
        filePath,
        extractedText,
        parsedStatus,
        parseError,
        uploadedBy: "admin", // 업로더 기본값
      },
    });

    // 프론트엔드 호환 포맷 리턴
    const responsePayload = {
      id: doc.id,
      fileName: doc.filename,
      title: doc.originalName,
      category: doc.category,
      description: doc.description,
      status: doc.parsedStatus,
      errorMessage: doc.parseError,
      createdAt: doc.createdAt,
    };

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/manuals error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
