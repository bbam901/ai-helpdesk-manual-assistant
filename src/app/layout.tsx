import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 헬프데스크 - 업무 매뉴얼 기반 지능형 지원 시스템",
  description: "사내 익명화 조치 매뉴얼 데이터 기반 자연어 검색 및 해결 절차 자동 추천 AI 헬프데스크 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
