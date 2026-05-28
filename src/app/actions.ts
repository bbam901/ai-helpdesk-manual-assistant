"use server";

import { searchManuals, getAllManuals } from "@/lib/manuals";
import { SearchResult, Manual } from "@/types/manual";

export async function searchManualsAction(query: string): Promise<SearchResult[]> {
  try {
    // 0.5초의 가상 지연 시간을 주어 실제 AI API 또는 DB 검색 서버와 통신하는 듯한 UX를 제공합니다.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const results = await searchManuals(query);
    return results;
  } catch (error) {
    console.error("Error searching manuals:", error);
    throw new Error("매뉴얼 검색 중 오류가 발생했습니다.");
  }
}

export async function getManualsAction(): Promise<Manual[]> {
  try {
    const manuals = await getAllManuals();
    return manuals;
  } catch (error) {
    console.error("Error fetching manuals:", error);
    return [];
  }
}
