import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role"); // "admin" or "user"
  const requesterName = searchParams.get("requesterName");

  try {
    let tickets;
    if (role === "admin") {
      tickets = await prisma.ticket.findMany({
        orderBy: { createdAt: "desc" },
      });
    } else {
      if (!requesterName) {
        return NextResponse.json({ error: "requesterName is required for user role" }, { status: 400 });
      }
      tickets = await prisma.ticket.findMany({
        where: { requesterName },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json(tickets);
  } catch (error) {
    console.error("GET /api/tickets error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // 유연한 필드 매핑 및 검증
    const title = data.title;
    const description = data.content || data.description;
    const requesterName = data.requester || data.requesterName;
    const requesterDept = data.department || data.requesterDept || "부서 미상";
    const referencedManual = data.referencedManual;
    const aiSuggestedSteps = data.suggestedAction || data.aiSuggestedSteps || [];
    const status = data.status || "open";

    // 필수 필드 미달 시 상세 에러 반환
    if (!title) {
      return NextResponse.json({ error: "티켓 제목(title) 필드가 누락되었습니다." }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: "장애 내용(content 또는 description) 필드가 누락되었습니다." }, { status: 400 });
    }
    if (!requesterName) {
      return NextResponse.json({ error: "요청자 이름(requester 또는 requesterName) 필드가 누락되었습니다." }, { status: 400 });
    }

    const newTicket = await prisma.ticket.create({
      data: {
        id: data.id, 
        title,
        description,
        category: data.category || "기타",
        priority: data.priority || "보통",
        requesterName,
        requesterDept,
        status,
        referencedManual,
        aiSuggestedSteps,
      },
    });

    return NextResponse.json(newTicket, { status: 201 });
  } catch (error: any) {
    // 6. DB 저장 실패 시 콘솔과 서버 로그에 구체적인 에러 메시지를 출력
    console.error("POST /api/tickets DB 저장 실패 상세 로그:", error);
    return NextResponse.json(
      { error: `데이터베이스 저장 실패: ${error.message || error.toString()}` },
      { status: 500 }
    );
  }
}
