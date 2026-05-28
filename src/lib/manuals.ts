import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { Manual, SearchResult } from "../types/manual";
import { prisma } from "./prisma";

// ESM 환경에서 CommonJS 라이브러리를 안전하게 불러오기 위해 createRequire 사용
const require = createRequire(import.meta.url);

// pdf-parse 내부의 pdfjs-dist가 요구하는 DOM-like 클래스들을 Node.js 환경에 폴리필
try {
  const { DOMMatrix, ImageData, Path2D } = require("@napi-rs/canvas");
  (globalThis as any).DOMMatrix = DOMMatrix;
  (globalThis as any).ImageData = ImageData;
  (globalThis as any).Path2D = Path2D;
  console.log("[Polyfill] Successfully injected DOMMatrix, ImageData, and Path2D from @napi-rs/canvas.");
} catch (canvasErr: any) {
  console.error("[Polyfill] Failed to load @napi-rs/canvas. PDF parsing might fail:", canvasErr.message || canvasErr);
}

// createRequire로 로드한 pdf-parse@1.1.1 함수 모듈
const pdfParse = require("pdf-parse");

// pdf-parse 결과에서 메타데이터를 정규식으로 안전하게 복구하는 헬퍼
function parsePdfMetadata(text: string, fileName: string): { metadata: Record<string, any>; content: string } {
  const metadata: Record<string, any> = {};
  
  // 메타데이터 헤더 필드 파싱
  const idMatch = text.match(/문서 ID:\s*(.*)/);
  const categoryMatch = text.match(/분류 카테고리:\s*(.*)/);
  const keywordsMatch = text.match(/검색 키워드:\s*(.*)/);
  const dateMatch = text.match(/최종 수정일:\s*(.*)/);
  const authorMatch = text.match(/작성자:\s*(.*)/);

  metadata.id = idMatch ? idMatch[1].trim() : fileName.replace(/\.pdf$/, "").toUpperCase();
  metadata.category = categoryMatch ? categoryMatch[1].trim() : "기타";
  metadata.last_updated = dateMatch ? dateMatch[1].trim() : "2026-05-20";
  metadata.author = authorMatch ? authorMatch[1].trim() : "IT지원팀";

  if (keywordsMatch) {
    const kwText = keywordsMatch[1].trim();
    // 대괄호나 따옴표 형태 제거 및 콤마로 파싱
    metadata.keywords = kwText
      .split(",")
      .map((k) => k.trim().replace(/[\[\]'"]/g, ""));
  } else {
    metadata.keywords = [];
  }

  // 본문 추출 (구분선 ========================================== 이후 텍스트)
  const contentParts = text.split(/={10,}/);
  const content = contentParts.length > 1 ? contentParts.slice(1).join("=").trim() : text;

  // 제목 추출 (# 제목 형태로 본문 시작 부분 파싱)
  const titleMatch = content.match(/^#\s+(.*)/m);
  metadata.title = titleMatch ? titleMatch[1].trim() : fileName.replace(/\.pdf$/, "").replace(/-/g, " ");

  return { metadata, content };
}

// 내부 사내 보안 정보(URL, 메일, IP) 가명화 필터링 헬퍼
function anonymizeSecureData(text: string): string {
  let processed = text;
  
  // 1. 내부/사내 도메인 및 일반 URL 익명화 대체
  processed = processed.replace(/https?:\/\/[a-zA-Z0-9.-]+\.(local|company|co\.kr)[a-zA-Z0-9.\/_-]*/gi, "[익명화된 사내 포털 시스템]");
  processed = processed.replace(/https?:\/\/[a-zA-Z0-9.-\/_-]+/gi, "[익명화된 시스템 주소]");

  // 2. 이메일 주소 익명화 대체
  processed = processed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, "[익명화된 IT지원 담당 메일]");

  // 3. 내부 IP 대역(e.g., 10.x.x.x) 익명화 대체
  processed = processed.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[익명화된 내부 IP 대역]");
  
  return processed;
}

// PDF 텍스트 정규화 헬퍼 (구분선, 단어 중간 줄바꿈, 페이지 번호 제거)
function normalizePdfText(text: string): string {
  let processed = text;

  // 1. 단어 중간의 하이픈 + 줄바꿈 복원 (예: Wi-\nFi -> Wi-Fi)
  processed = processed.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1-$2");

  // 2. 장식용 구분선 라인 제거 (예: ---, ===, * * *)
  processed = processed.replace(/^[-=]{3,}\s*$/gm, "");
  processed = processed.replace(/^\*\s+\*\s+\*\s*$/gm, "");

  // 3. 페이지 번호 또는 단독 숫자 줄 제거 (예: 공백 포함한 단독 숫자)
  processed = processed.replace(/^\s*\d+\s*$/gm, "");

  // 4. 연속 줄바꿈 축소 및 양끝 트림
  processed = processed.replace(/\r\n/g, "\n");
  processed = processed.replace(/\n{3,}/g, "\n\n");

  return processed;
}

const manualsDirectory = path.join(process.cwd(), "src/data/manuals");

// PDF 텍스트 파싱이 무겁기 때문에 비동기로 모든 매뉴얼을 로드함
export async function getAllManuals(): Promise<Manual[]> {
  const manuals: Manual[] = [];

  // 1. 기본 제공되는 static PDF 매뉴얼 로드 (src/data/manuals)
  if (fs.existsSync(manualsDirectory)) {
    const fileNames = fs.readdirSync(manualsDirectory);
    const pdfFiles = fileNames.filter((fileName) => fileName.endsWith(".pdf"));
    console.log(`[PDF Loader] Static target directory: ${manualsDirectory}`);
    console.log(`[PDF Loader] Found static PDF files:`, pdfFiles);

    for (const fileName of pdfFiles) {
      try {
        const filePath = path.join(manualsDirectory, fileName);
        console.log(`[PDF Loader] Reading and parsing static PDF file: ${fileName}...`);
        const dataBuffer = fs.readFileSync(filePath);
        
        if (typeof pdfParse !== "function") {
          throw new Error("Resolved pdfParse from createRequire is not a function.");
        }

        const pdfData = await pdfParse(dataBuffer);
        const rawText = pdfData.text;
        
        const { metadata, content } = parsePdfMetadata(rawText, fileName);
        const normalizedContent = normalizePdfText(content);
        const anonymizedContent = anonymizeSecureData(normalizedContent);

        manuals.push({
          id: metadata.id || fileName,
          title: metadata.title || fileName,
          category: metadata.category || "기타",
          keywords: metadata.keywords || [],
          author: metadata.author || "시스템",
          lastUpdated: metadata.last_updated || "2026-05-20",
          content: anonymizedContent,
          filePath,
        });
      } catch (err: any) {
        console.error(`[PDF Loader] Failed to parse static PDF file ${fileName}:`, err.stack || err.message || err);
      }
    }
  } else {
    console.warn(`[PDF Loader] Static manuals directory NOT found at: ${manualsDirectory}`);
  }

  // 2. DB에 등록되어 텍스트 추출이 완 완료된 업로드 매뉴얼 로드 (ManualDocument)
  let dbDocs: any[] = [];
  try {
    dbDocs = await prisma.manualDocument.findMany({
      where: { parsedStatus: "success" }
    });
  } catch (dbErr) {
    console.error("[PDF Loader] Failed to fetch ManualDocuments from DB:", dbErr);
  }

  for (const doc of dbDocs) {
    try {
      const rawText = doc.extractedText;
      const { metadata, content } = parsePdfMetadata(rawText, doc.filename);
      const normalizedContent = normalizePdfText(content);
      const anonymizedContent = anonymizeSecureData(normalizedContent);

      const finalContent = `설명: ${doc.description}\n\n${anonymizedContent}`;

      manuals.push({
        id: doc.id,
        title: doc.originalName, // 사용자 지정 타이틀
        category: doc.category,
        keywords: [doc.category],
        author: doc.uploadedBy || "관리자",
        lastUpdated: doc.createdAt.toISOString().slice(0, 10),
        content: finalContent,
        filePath: doc.filePath,
      });
    } catch (err: any) {
      console.error(`[PDF Loader] Failed to load DB manual document ${doc.filename}:`, err);
    }
  }

  return manuals;
}

// 예상 원인(Expected Causes) 추출 헬퍼
function extractExpectedCauses(content: string): string[] {
  const causes: string[] = [];
  const lines = content.split("\n");
  let isInCausesSection = false;

  for (const line of lines) {
    if (line.match(/^##\s+\d+\.\s+원인\s+분석/) || line.match(/^##\s+원인\s+분석/)) {
      isInCausesSection = true;
      continue;
    }
    if (isInCausesSection && line.startsWith("## ") && !line.startsWith("###")) {
      break;
    }

    if (isInCausesSection) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("-") || cleanLine.startsWith("*")) {
        const processed = cleanLine.replace(/^[-*]\s+/, "").replace(/[*`>]/g, "").trim();
        if (processed) {
          causes.push(processed);
        }
      }
    }
  }

  if (causes.length === 0) {
    return ["상세 문서의 주요 원인 분석 탭을 확인해 주십시오."];
  }
  return causes;
}

// 추가 확인 사항 및 문의처(Additional Checks / Contacts) 추출 헬퍼
function extractAdditionalChecks(content: string): string[] {
  const checks: string[] = [];
  const lines = content.split("\n");
  let isInContactsSection = false;

  for (const line of lines) {
    if (line.match(/^##\s+\d+\.\s+관련\s+부서/) || line.match(/^##\s+관련\s+부서\s+및\s+문의처/)) {
      isInContactsSection = true;
      continue;
    }
    if (isInContactsSection && line.startsWith("## ") && !line.startsWith("###")) {
      break;
    }

    if (isInContactsSection) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("-") || cleanLine.startsWith("*")) {
        const processed = cleanLine.replace(/^[-*]\s+/, "").replace(/[*`>]/g, "").trim();
        if (processed) {
          checks.push(processed);
        }
      }
    }
  }

  if (checks.length === 0) {
    return ["IT 지원팀 또는 관련 부서 대표 이메일로 지원을 요청하시기 바랍니다."];
  }
  return checks;
}

// 장애 조치 단계(Action Plan) 추출 헬퍼
function extractSuggestedSteps(content: string): string[] {
  const steps: string[] = [];
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  let isInStepsSection = false;
  let rawStepsBuffer: string[] = [];

  for (const line of lines) {
    // 1. 조치 절차 섹션 시작 감지
    if (line.match(/^##\s+\d+\.\s+(단계별\s+)?해결\s+절차/) || line.match(/^##\s+\d+\.\s+조치\s+절차/)) {
      isInStepsSection = true;
      continue;
    }
    
    // 2. 다음 대분류 세션(##)이 시작되면 종료
    if (isInStepsSection && line.startsWith("## ") && !line.startsWith("###")) {
      break;
    }

    if (isInStepsSection) {
      // 구분선 및 노이즈 라인 제외
      if (line.match(/^[-=]{3,}/) || line === "---" || line === "===") continue;
      // 키워드 및 메타 부속 속성 라인 차단
      if (line.includes("관련 부서") || line.includes("문의처") || line.includes("검색 키워드")) continue;

      rawStepsBuffer.push(line);
    }
  }

  // 조치 절차 내의 원시 라인들을 논리적인 구조적 단계로 병합 파싱
  if (rawStepsBuffer.length > 0) {
    let currentStep = "";
    
    for (const line of rawStepsBuffer) {
      // 새로운 독립 단계의 시작 유형 판별
      const isNewStep = 
        line.startsWith("###") || 
        line.match(/^(단계\s*\d+|\[?단계\s*\d+\]?|\d+단계|\d+[\.\s\-]+)/) ||
        line.startsWith("-") || 
        line.startsWith("•") || 
        line.startsWith("*");

      if (isNewStep) {
        if (currentStep.trim()) {
          steps.push(currentStep.trim());
        }
        currentStep = line;
      } else {
        if (currentStep) {
          // 줄바꿈 대신 띄어쓰기로 결합하여 문장의 단어 끊김을 근본적으로 보정
          currentStep += " " + line;
        } else {
          currentStep = line;
        }
      }
    }
    if (currentStep.trim()) {
      steps.push(currentStep.trim());
    }
  }

  // 3. 만약 구조적 목록 단계가 부재하는 플랫 단락 형태일 경우, 온점 단위 문장 분할 가동
  if (steps.length === 0 && rawStepsBuffer.length > 0) {
    const fullText = rawStepsBuffer.join(" ");
    const sentences = fullText.split(/(?<=[.!?])\s+/);
    sentences.forEach(s => {
      const trimmed = s.trim();
      if (trimmed.length > 8) {
        steps.push(trimmed);
      }
    });
  }

  return steps.length > 0 ? steps : ["상세 조치 사항은 근거 문서를 참조하시기 바랍니다."];
}

// 텍스트 내에서 검색어와 매칭되는 구체적인 근거 문장을 추출하는 함수
function extractMatchedSnippets(content: string, searchTerms: string[]): string[] {
  const snippets: string[] = [];
  
  // 온점(.), 물음표(?), 느낌표(!), 혹은 줄바꿈 기준으로 문장을 쪼갬
  const sentences = content
    .split(/[.?!]|\n/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 150); // 너무 짧거나 너무 긴 안내문은 배제하여 가독성 유지

  for (const sentence of sentences) {
    // 마크다운 헤더 기호(#) 제거
    const cleanSentence = sentence.replace(/[#*`>]/g, "").trim();
    
    // 검색 단어가 하나라도 문장에 포함되어 있는지 검사
    const hasTerm = searchTerms.some(term => cleanSentence.toLowerCase().includes(term));
    
    if (hasTerm && !snippets.includes(cleanSentence)) {
      snippets.push(cleanSentence);
      if (snippets.length >= 3) break; // 최대 3문장만 반환
    }
  }

  return snippets;
}

// 유사 표현 동의어 사전 정의
const SYNONYM_GROUPS = [
  ["로그인 안됨", "접속 불가", "로그인 실패", "로그인오류", "계정 잠금", "비밀번호 오류", "로그인이 안", "접속이 안", "비밀번호 5회", "인증 오류", "패스워드", "비밀번호", "잠김", "계정잠금", "인증 실패"],
  ["권한 없음", "권한이 없습니다", "접근 불가", "권한 오류", "접근 권한", "액세스 거부", "첨부파일 권한", "접근이 거부", "접근 거부", "승인 필요"],
  ["첨부파일", "파일 업로드", "업로드 실패", "파일 첨부", "업로드가 안", "파일 전송", "첨부파일 업로드", "업로드 버튼", "다운로드", "파일 크기"],
  ["메일 용량", "사서함 용량", "mailbox full", "사서함 초과", "메일함 용량", "메일 발송 안됨", "용량 초과", "메일함이 가득", "아웃룩 용량", "메일 용량 초과"],
  ["프린터", "인쇄", "출력", "스풀러", "spooler", "인쇄 대기", "프린터 멈춤", "대기열", "대기열에", "인쇄물", "출력이 안", "토너", "용지 걸림"],
  ["vpn", "원격 접속", "보안 접속", "forticlient", "사외 접속", "재택근무 접속", "otp 인증", "otp 번호", "사외망", "외부 접속"],
  ["drm", "문서 보안", "보안 문서", "암호화", "복호화", "softcamp", "fasoo", "문서 열기 실패", "문서 오류", "보안 파일"],
  ["결재", "승인", "erp", "전자 결재", "상신", "반려", "기안", "결재선"],
  ["캐시", "인터넷 임시 파일", "chrome cache", "쿠키", "cookie", "브라우저 초기화", "인터넷 옵션", "쿠키 삭제"],
  ["하드웨어", "모니터", "프로젝터", "빔", "화면 안나옴", "신호 없음", "프로젝터 연결", "빔 프로젝터"],
  ["ip", "아이피", "ip 충돌", "dhcp", "ip conflict", "아이피 충돌", "네트워크 충돌"]
];

// 질문 카테고리 자동 분류를 위한 키워드 규칙 매핑 및 분류 함수
export function classifyCategory(query: string): string {
  const queryLower = query.toLowerCase();
  
  const rules = [
    {
      category: "계정/권한",
      keywords: ["계정", "권한", "로그인", "접속", "비밀번호", "패스워드", "잠금", "인증", "otp", "approval", "결재", "login", "auth"]
    },
    {
      category: "네트워크/보안",
      keywords: ["네트워크", "보안", "vpn", "인터넷", "wifi", "와이파이", "방화벽", "ip", "conflict", "ssl", "cert", "인증서", "드라이브", "공유"]
    },
    {
      category: "시스템/메일",
      keywords: ["시스템", "메일", "outlook", "아웃룩", "mailbox", "사서함", "용량", "동기화", "sync", "erp", "예산", "중계", "그룹웨어"]
    },
    {
      category: "하드웨어/주변기기",
      keywords: ["하드웨어", "주변기기", "프린터", "인쇄", "출력", "스풀러", "spooler", "대기열", "스캐너", "복사기", "프로젝터", "빔", "화면", "신호", "전화기", "voip"]
    }
  ];

  let bestCategory = "기타";
  let maxMatches = 0;

  for (const rule of rules) {
    let matches = 0;
    for (const kw of rule.keywords) {
      if (queryLower.includes(kw)) {
        matches++;
      }
    }
    if (matches > maxMatches) {
      maxMatches = matches;
      bestCategory = rule.category;
    }
  }

  if (maxMatches === 0) {
    for (const rule of rules) {
      const matched = rule.keywords.some(kw => queryLower.includes(kw));
      if (matched) {
        return rule.category;
      }
    }
  }

  return bestCategory;
}

// 특수 문자 정규식 이스케이프 헬퍼
function escapeRegex(str: string): string {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// 질문 형태소 및 동의어 사전 활용한 검색어 확장 (Query Expansion)
function expandQueryTerms(query: string): string[] {
  const queryLower = query.toLowerCase();
  
  // 기본 공백 단위 토큰 분할
  const baseTerms = queryLower
    .replace(/[?,.!\(\)\[\]]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1);

  const expandedTerms = new Set<string>(baseTerms);

  // 동의어 매칭 시 그룹 전체 어휘 주입
  for (const group of SYNONYM_GROUPS) {
    let match = false;
    for (const val of group) {
      if (queryLower.includes(val.toLowerCase())) {
        match = true;
        break;
      }
    }
    if (match) {
      group.forEach(val => {
        val.split(/\s+/).forEach(v => {
          if (v.length > 1) expandedTerms.add(v.toLowerCase());
        });
        expandedTerms.add(val.toLowerCase());
      });
    }
  }

  if (expandedTerms.size === 0 && query.trim().length > 0) {
    expandedTerms.add(query.trim().toLowerCase());
  }

  return Array.from(expandedTerms);
}

interface DocumentChunk {
  manualId: string;
  manualTitle: string;
  category: string;
  keywords: string[];
  author: string;
  lastUpdated: string;
  filePath: string;
  sectionTitle: string;
  content: string;
  fullManual: Manual;
}

// 매뉴얼을 논리적 대분류인 ## 및 ### 섹션 단위로 계층 구조화하여 쪼개는 청킹(Chunking) 함수
function chunkManuals(manuals: Manual[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const manual of manuals) {
    // ## 및 ### 헤더가 출현하는 지점 기준으로 텍스트를 청크 분할
    const sections = manual.content.split(/(?=^##{1,2}\s+)/m);
    
    let currentMainSectionTitle = "개요";
    
    for (const sec of sections) {
      const trimmedSec = sec.trim();
      if (!trimmedSec) continue;

      let sectionTitle = "개요 및 사양";
      let sectionContent = trimmedSec;

      if (trimmedSec.startsWith("##")) {
        const lines = trimmedSec.split("\n");
        const headerMatch = lines[0].match(/^##{1,2}\s+(.*)/);
        
        if (headerMatch) {
          const matchedTitle = headerMatch[1].trim();
          if (trimmedSec.startsWith("###")) {
            // 소주제 청크(###)에 대주제 맥락을 접두어로 합성하여 RAG 데이터 손실 방지
            sectionTitle = `${currentMainSectionTitle} > ${matchedTitle}`;
          } else {
            sectionTitle = matchedTitle;
            currentMainSectionTitle = matchedTitle;
          }
        }
        sectionContent = lines.slice(1).join("\n").trim();
      } else {
        const titleMatch = trimmedSec.match(/^#\s+(.*)/m);
        if (titleMatch) {
          sectionTitle = "개요: " + titleMatch[1].trim();
        }
      }

      chunks.push({
        manualId: manual.id,
        manualTitle: manual.title,
        category: manual.category,
        keywords: manual.keywords,
        author: manual.author,
        lastUpdated: manual.lastUpdated,
        filePath: manual.filePath,
        sectionTitle,
        content: sectionContent,
        fullManual: manual,
      });
    }
  }

  return chunks;
}

export async function searchManuals(query: string): Promise<SearchResult[]> {
  if (!query || query.trim() === "") {
    return [];
  }

  const manuals = await getAllManuals();
  const chunks = chunkManuals(manuals);
  const terms = expandQueryTerms(query);

  const scoredChunks: { chunk: DocumentChunk; score: number; matchedKeywords: string[] }[] = [];

  for (const chunk of chunks) {
    let score = 0;
    const matchedKeywords: string[] = [];
    const chunkContentLower = chunk.content.toLowerCase();
    const chunkTitleLower = chunk.sectionTitle.toLowerCase();
    const docTitleLower = chunk.manualTitle.toLowerCase();
    const categoryLower = chunk.category.toLowerCase();

    terms.forEach(term => {
      // 1. 키워드 정확 일치 (Exact Tag Match) 가중치: 30점
      chunk.keywords.forEach(keyword => {
        if (keyword.toLowerCase() === term) {
          score += 30;
          if (!matchedKeywords.includes(keyword)) {
            matchedKeywords.push(keyword);
          }
        }
      });

      // 2. 제목 일치 가중치: 15점
      if (docTitleLower.includes(term) || chunkTitleLower.includes(term)) {
        score += 15;
      }

      // 3. 카테고리 일치 가중치: 5점
      if (categoryLower.includes(term)) {
        score += 5;
      }

      // 4. 본문 단락 내 출현 빈도수 가중치: 건당 2점 (최대 15점)
      try {
        const escaped = escapeRegex(term);
        const count = (chunkContentLower.match(new RegExp(escaped, "g")) || []).length;
        if (count > 0) {
          score += Math.min(count * 2, 15);
        }
      } catch (e) {}
    });

    if (score > 0) {
      scoredChunks.push({
        chunk,
        score,
        matchedKeywords,
      });
    }
  }

  // 연관도 내림차순 정렬
  const sortedChunks = scoredChunks.sort((a, b) => b.score - a.score);

  // 8. 관련도 점수가 낮으면 억지 답변하지 않고 비우기 (최고 점수 단락이 임계값 15점 미만인 경우)
  if (sortedChunks.length === 0 || sortedChunks[0].score < 15) {
    return [];
  }

  // 상위 3~5개 문단 선별 (최대 4개)
  const topChunks = sortedChunks.slice(0, 4);

  // 융합 답변용 데이터 버퍼
  const expectedCauses: string[] = [];
  const suggestedSteps: string[] = [];
  const additionalChecks: string[] = [];
  const matchedSnippets: string[] = [];
  const allMatchedKeywords = new Set<string>();

  topChunks.forEach(item => {
    item.matchedKeywords.forEach(k => allMatchedKeywords.add(k));
    
    const content = item.chunk.content;
    const title = item.chunk.sectionTitle;

    // 예상 원인 수집
    if (title.includes("원인") || title.includes("증상") || title.includes("분석")) {
      extractExpectedCauses(content).forEach(c => {
        if (!expectedCauses.includes(c) && c !== "상세 문서의 주요 원인 분석 탭을 확인해 주십시오.") {
          expectedCauses.push(c);
        }
      });
    }

    // 조치 절차 수집
    if (title.includes("절차") || title.includes("단계") || title.includes("조치") || title.includes("해결")) {
      extractSuggestedSteps(content).forEach(s => {
        if (!suggestedSteps.includes(s) && s !== "상세 조치 사항은 근거 문서를 참조하시기 바랍니다.") {
          suggestedSteps.push(s);
        }
      });
    }

    // 추가 확인 사항 수집
    if (title.includes("문의") || title.includes("부서") || title.includes("확인") || title.includes("상태")) {
      extractAdditionalChecks(content).forEach(ch => {
        if (!additionalChecks.includes(ch) && ch !== "IT 지원팀 또는 관련 부서 대표 이메일로 지원을 요청하시기 바랍니다.") {
          additionalChecks.push(ch);
        }
      });
    }

    // 참고 문장 스니펫 추출
    extractMatchedSnippets(content, terms).forEach(sn => {
      if (!matchedSnippets.includes(sn)) {
        matchedSnippets.push(sn);
      }
    });
  });

  // 폴백 제어: 특정 수집 정보가 부재할 경우 최상위 매치 문서에서 추출
  const primaryManual = topChunks[0].chunk.fullManual;
  const primaryContent = primaryManual.content;

  if (expectedCauses.length === 0) {
    expectedCauses.push(...extractExpectedCauses(primaryContent));
  }
  if (suggestedSteps.length === 0) {
    suggestedSteps.push(...extractSuggestedSteps(primaryContent));
  }
  if (additionalChecks.length === 0) {
    additionalChecks.push(...extractAdditionalChecks(primaryContent));
  }
  if (matchedSnippets.length === 0) {
    matchedSnippets.push(...extractMatchedSnippets(primaryContent, terms));
  }

  const maxScore = sortedChunks[0]?.score || 1;
  const referenceScore = Math.max(maxScore, 40);
  const getRelevance = (s: number) => {
    return Math.min(Math.round((s / referenceScore) * 100), 100);
  };
  const categoryCls = classifyCategory(query);

  const results: SearchResult[] = [];

  // 1. 병합된 AI엔진 요약 결과 (최상위 추천 답변)
  results.push({
    manual: {
      ...primaryManual,
      title: `${primaryManual.title} (연관 단락 기반 교차 요약)`,
    },
    score: topChunks[0].score,
    relevance: getRelevance(topChunks[0].score),
    classifiedCategory: categoryCls,
    matchedKeywords: Array.from(allMatchedKeywords).length > 0 ? Array.from(allMatchedKeywords) : primaryManual.keywords.slice(0, 3),
    expectedCauses: expectedCauses.slice(0, 4),
    suggestedSteps: suggestedSteps.slice(0, 5),
    additionalChecks: additionalChecks.slice(0, 3),
    matchedSnippets: matchedSnippets.slice(0, 4),
  });

  // 2. 각 매칭 단락들을 "참고 문서 근거" 목록으로 매핑 (결과 스코어 역순)
  sortedChunks.forEach(item => {
    const chunkTitle = `${item.chunk.manualTitle} > ${item.chunk.sectionTitle}`;
    
    // 중복 추가 방지
    const isAlreadyAdded = results.some(
      r => r.manual.id === item.chunk.manualId && r.manual.title.includes(item.chunk.sectionTitle)
    );

    if (!isAlreadyAdded && results.length < 5) {
      const chunkSnippets = extractMatchedSnippets(item.chunk.content, terms);
      
      results.push({
        manual: {
          id: `${item.chunk.manualId}-${item.chunk.sectionTitle.replace(/\s+/g, "")}`,
          title: chunkTitle,
          category: item.chunk.category,
          keywords: item.chunk.keywords,
          author: item.chunk.author,
          lastUpdated: item.chunk.lastUpdated,
          content: item.chunk.content,
          filePath: item.chunk.filePath,
        },
        score: item.score,
        relevance: getRelevance(item.score),
        classifiedCategory: categoryCls,
        matchedKeywords: item.matchedKeywords.length > 0 ? item.matchedKeywords : item.chunk.keywords.slice(0, 2),
        expectedCauses: extractExpectedCauses(item.chunk.content),
        suggestedSteps: extractSuggestedSteps(item.chunk.content),
        additionalChecks: extractAdditionalChecks(item.chunk.content),
        matchedSnippets: chunkSnippets.length > 0 ? chunkSnippets : [item.chunk.content.slice(0, 100) + "..."],
      });
    }
  });

  return results;
}
