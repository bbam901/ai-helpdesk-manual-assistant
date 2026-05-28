"use client";

import { useState, useEffect } from "react";
import { searchManualsAction, getManualsAction } from "./actions";
import { SearchResult, Manual, Ticket } from "@/types/manual";

interface User {
  username: string;
  role: "user" | "admin";
  name: string;
  dept: string;
}

interface UserDiagnostic {
  requesterName: string;
  requesterDept: string;
  totalCount: number;
  openCount: number;
  resolvedCount: number;
  recentDescription: string;
  topCategory: string;
}

// 간단한 마크다운 렌더러 함수
function renderMarkdown(markdown: string) {
  if (!markdown) return "";
  
  let html = markdown;
  
  // 1. 코드 블록 처리
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="my-4 p-4 bg-slate-950/80 rounded-lg border border-slate-800 text-slate-200 overflow-x-auto text-sm font-mono"><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // 2. 인라인 코드
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-900 border border-slate-800 text-rose-400 rounded text-xs font-mono">$1</code>');

  // 3. 인용구 (Blockquote)
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="border-l-4 border-indigo-500 bg-indigo-500/10 px-4 py-2 my-4 rounded-r-lg text-indigo-300">$1</blockquote>');

  // 4. 헤더
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-base font-bold text-sky-400 mt-6 mb-2">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-lg font-bold text-slate-100 mt-8 mb-3 border-b border-slate-800 pb-1">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-xl font-bold text-slate-50 mt-10 mb-4">$1</h1>');

  // 5. 강조 (Bold)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-100">$1</strong>');

  // 6. 리스트 항목
  html = html.replace(/^\s*-\s+(.+)$/gm, '<li class="ml-4 list-disc text-slate-300 my-1">$1</li>');
  html = html.replace(/^\s*\*\s+(.+)$/gm, '<li class="ml-4 list-disc text-slate-300 my-1">$1</li>');

  // 7. 단락 줄바꿈 처리
  html = html.split('\n').map(line => {
    if (line.trim().startsWith('<h') || line.trim().startsWith('<pre') || line.trim().startsWith('</pre') || line.trim().startsWith('<li') || line.trim().startsWith('<bl') || line.trim().startsWith('</bl') || line.trim() === '') {
      return line;
    }
    return `<p class="my-2 leading-relaxed text-slate-400">${line}</p>`;
  }).join('\n');

  return html;
}

// 백틱(`)으로 감싸진 코드를 monospace 스타일로 렌더링하는 인라인 헬퍼
function renderTextWithCode(text: string) {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const cleanCode = part.slice(1, -1);
      return (
        <code 
          key={index} 
          className="font-mono bg-slate-900/90 text-pink-400 px-1.5 py-0.5 rounded border border-slate-800/80 text-[10.5px] mx-0.5 whitespace-pre-wrap break-all"
        >
          {cleanCode}
        </code>
      );
    }
    return part;
  });
}

// 검색 질의어 매칭 단어 형광펜 하이라이트 헬퍼
function highlightText(text: string, query: string, matchedKeywords: string[] = []) {
  if (!text) return null;

  // Extract query terms (words of length >= 2)
  const queryTerms = query
    .split(/\s+/)
    .map(w => w.replace(/[?.!,]/g, "").trim())
    .filter(w => w.length > 1);

  // Combine query terms and matched keywords to highlight
  const allTerms = Array.from(new Set([...queryTerms, ...matchedKeywords]));
  
  // Sort terms by length in descending order to match longer phrases/words first
  const sortedTerms = allTerms
    .map(t => t.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (sortedTerms.length === 0) return text;

  // Escape special regex chars
  const escapedTerms = sortedTerms.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join("|")})`, "gi");

  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (regex.test(part)) {
      return (
        <mark 
          key={index} 
          className="bg-amber-500/20 text-amber-300 px-0.5 rounded font-semibold border-b border-amber-500/30"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

// 초기 데모용 샘플 티켓 리스트 (localStorage가 비어있을 때만 이식됨)
const INITIAL_TICKETS: Ticket[] = [
  {
    id: "TKT-20260520-001",
    title: "사외 VPN 연결 시 OTP 시간 인증 실패 에러",
    description: "재택근무 중인데 FortiClient VPN OTP 인증 번호가 계속 안 맞는다고 나오며 VPN 접속이 실패합니다.",
    category: "네트워크",
    priority: "높음",
    referencedManual: "VPN 사외 접속 및 OTP 보안 모듈 매뉴얼",
    requesterName: "Jang Geu-rae",
    requesterDept: "Sales Team 3",
    createdAt: "2026. 5. 20. 오후 1:12:05",
    status: "resolved",
    resolvedAt: "2026. 5. 20. 오후 1:25:40",
    resolverName: "IT 담당자 A",
    resolutionComment: "VPN 클라이언트 OTP 시간 동기화(Sync) 설정을 초기화하고 모바일 OTP 앱과 시간을 강제 동기화시킨 후 접속 정상을 확인함.",
    aiSuggestedSteps: [
      "모바일 OTP 앱의 시간 설정 메뉴로 진입합니다.",
      "시간 강제 동기화 버튼을 눌러 NTP 서버와 모바일 기기의 타임스탬프 일치율을 보정합니다.",
      "FortiClient VPN 프로그램 설정에서 인증 캐시를 제거합니다.",
      "OTP 코드를 재생성하여 재로그인을 시도합니다."
    ]
  },
  {
    id: "TKT-20260520-002",
    title: "재택근무 중 VPN 접속 실패 및 통신 두절 현상",
    description: "재택근무 중 VPN 접속이 계속 실패합니다. 내부 게이트웨이 IP Ping 테스트 시 Request timed out 에러가 발생합니다.",
    category: "네트워크",
    priority: "긴급",
    referencedManual: "VPN 사외 접속 및 OTP 보안 모듈 매뉴얼",
    requesterName: "홍길동",
    requesterDept: "IT 지원팀",
    createdAt: "2026. 5. 20. 오후 2:05:10",
    status: "resolved",
    resolvedAt: "2026. 5. 20. 오후 2:20:15",
    resolverName: "IT 담당자 B",
    resolutionComment: "게이트웨이 스위치 보안 정책 예외 적용 및 로컬 ISP 모뎀 재부팅 가이드를 통해 VPN 터널링 정상 구성을 확인하고 종결함.",
    aiSuggestedSteps: [
      "사내 게이트웨이 및 원격 접속 엔드포인트 IP 정보를 확인합니다.",
      "VPN 터널 장비의 포트 오픈 여부 및 로컬 방화벽 차단 설정을 검사합니다.",
      "로컬 네트워크 DNS 캐시(ipconfig /flushdns)를 정리합니다."
    ]
  },
  {
    id: "TKT-20260520-003",
    title: "그룹웨어 결재 파일 업로드 시 응답 없음 장애",
    description: "결재 상신 화면에서 대용량 첨부파일(PDF) 업로드를 클릭하면 브라우저 플러그인 에러가 나타나며 업로드가 정지됩니다.",
    category: "소프트웨어",
    priority: "보통",
    referencedManual: "그룹웨어 결재문서 작성 및 첨부파일 에러 대처 가이드",
    requesterName: "홍길동",
    requesterDept: "IT 지원팀",
    createdAt: "2026. 5. 20. 오후 2:40:00",
    status: "resolved",
    resolvedAt: "2026. 5. 20. 오후 3:02:11",
    resolverName: "IT 담당자 A",
    resolutionComment: "HTML5 업로더 모드 전환 설정 안내 및 브라우저 임시 캐시 초기화 지원을 통해 파일 업로드 정상 구성을 완료함.",
    aiSuggestedSteps: [
      "브라우저의 플러그인(ActiveX/NPAPI) 호환 설정을 복구합니다.",
      "파일 탐색기 임시 폴더 내의 결재 캐시 파일을 제거합니다.",
      "크롬/에지 브라우저에서 '하드웨어 가속 사용' 옵션을 비활성화한 후 브라우저를 재시작합니다."
    ]
  }
];

export default function Home() {
  // 컴포넌트 마운트 여부 (Hydration Mismatch 및 localStorage 복원 보호막)
  const [isMounted, setIsMounted] = useState(false);

  // 인증/역할 상태
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // 메인 탭 제어
  // 일반 사용자: "chat" (질문 화면), "my-tickets" (내 문의 대시보드)
  // 관리자: "chat" (질문 화면), "admin-dashboard" (어드민 대시보드), "user-diagnostics" (사용자 진단 뷰), "manual-management" (매뉴얼 관리)
  const [mainTab, setMainTab] = useState<"chat" | "my-tickets" | "admin-dashboard" | "user-diagnostics" | "manual-management">("chat");

  // 매뉴얼 관리 관련 상태
  const [uploadedManuals, setUploadedManuals] = useState<any[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("계정/권한");
  const [uploadDesc, setUploadDesc] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [activeManual, setActiveManual] = useState<Manual | null>(null);
  const [manualDetailTab, setManualDetailTab] = useState<"ai" | "raw">("ai");
  const [allManuals, setAllManuals] = useState<Manual[]>([]);
  const [feedback, setFeedback] = useState<"solved" | "unsolved" | null>(null);

  // 대시보드 티켓 배열 & 검색어 상태
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [searchedKeywords, setSearchedKeywords] = useState<{[key: string]: number}>({});

  // 티켓 입력 폼 바인딩 필드
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketCategory, setTicketCategory] = useState("기타");
  const [ticketPriority, setTicketPriority] = useState<"낮음" | "보통" | "높음" | "긴급">("보통");
  const [ticketName, setTicketName] = useState("");
  const [ticketDept, setTicketDept] = useState("");

  // 관리자 조치 모달 제어용 상태
  const [activeTicketForResolution, setActiveTicketForResolution] = useState<Ticket | null>(null);
  const [activeTicketForDetail, setActiveTicketForDetail] = useState<Ticket | null>(null);
  const [resolutionComment, setResolutionComment] = useState("");
  const [resolverNameInput, setResolverNameInput] = useState("IT 담당자 A");

  const fetchAllManuals = async () => {
    try {
      const manuals = await getManualsAction();
      setAllManuals(manuals);
    } catch (err) {
      console.error("Error fetching manuals:", err);
    }
  };

  const fetchUploadedManuals = async () => {
    try {
      const res = await fetch("/api/admin/manuals");
      if (res.ok) {
        const data = await res.json();
        setUploadedManuals(data);
      }
    } catch (err) {
      console.error("Failed to fetch uploaded manuals:", err);
    }
  };

  // 초기 시작 시 PDF 매뉴얼 목록 조회 및 localStorage 데이터 복원
  useEffect(() => {
    setIsMounted(true);
    fetchAllManuals();

    const savedKeywords = localStorage.getItem("helpdesk_keywords");
    if (savedKeywords) {
      try {
        setSearchedKeywords(JSON.parse(savedKeywords));
      } catch (e) {
        console.error("Error parsing keywords:", e);
      }
    }

    // 로그인 정보 복원
    const savedUser = localStorage.getItem("helpdesk_current_user");
    if (savedUser) {
      try {
        const userObj: User = JSON.parse(savedUser);
        setCurrentUser(userObj);
        setTicketName(userObj.name);
        setTicketDept(userObj.dept);
      } catch (e) {
        console.error("Error parsing user info:", e);
      }
    }
  }, []);

  // 어드민인 경우 업로드된 매뉴얼 목록 조회
  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchUploadedManuals();
    }
  }, [currentUser]);

  // 로그인한 사용자에 따라 티켓 데이터 DB에서 조회
  useEffect(() => {
    const fetchTickets = async () => {
      if (!currentUser) {
        setTickets([]);
        return;
      }
      try {
        const url = `/api/tickets?role=${currentUser.role}&requesterName=${encodeURIComponent(currentUser.name)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setTickets(data);
        }
      } catch (error) {
        console.error("Error fetching tickets from DB:", error);
      }
    };
    fetchTickets();
  }, [currentUser]);

  // 로그인 핸들러
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (loginUsername === "user" && loginPassword === "user123") {
      const userObj: User = { username: "user", role: "user", name: "장그래", dept: "영업3팀" };
      setCurrentUser(userObj);
      setTicketName(userObj.name);
      setTicketDept(userObj.dept);
      setMainTab("chat");
      localStorage.setItem("helpdesk_current_user", JSON.stringify(userObj));
    } else if (loginUsername === "admin" && loginPassword === "admin123") {
      const adminObj: User = { username: "admin", role: "admin", name: "IT 마스터", dept: "IT 운영본부" };
      setCurrentUser(adminObj);
      setTicketName(adminObj.name);
      setTicketDept(adminObj.dept);
      setMainTab("chat");
      localStorage.setItem("helpdesk_current_user", JSON.stringify(adminObj));
    } else {
      setLoginError("아이디 또는 비밀번호가 잘못되었습니다.");
    }
  };

  // 로그아웃 핸들러
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("helpdesk_current_user");
    setMainTab("chat");
    setQuery("");
    setResults(null);
  };

  // 추천 검색어 목록
  const recommendedQueries = [
    {
      title: "ERP 로그인 실패",
      desc: "비밀번호 5회 오입력으로 인한 계정 잠금 오류",
      text: "ERP 비밀번호를 5번 잘못 입력해서 계정이 잠겼어요. 재접속이 안 됩니다."
    },
    {
      title: "VPN OTP 인증 오류",
      desc: "사외 VPN 연결 시 OTP 시간 동기화 실패 문제",
      text: "재택근무 중인데 FortiClient VPN OTP 인증 번호가 계속 안 맞는다고 나와요."
    },
    {
      title: "결재문서 파일 첨부 오류",
      desc: "그룹웨어 결재 상신 시 플러그인 충돌로 업로드 실패",
      text: "그룹웨어 전자결재에서 첨부파일 업로드 버튼을 눌렀는데 반응이 없고 파일이 안 올라가요."
    },
    {
      title: "아웃룩 사서함 용량 초과",
      desc: "Outlook Exchange 용량 한도 초과 및 송수신 불가",
      text: "아웃룩 메일함 용량이 꽉 차서 메일 발송이 안 되고 배달 실패 메일이 옵니다."
    },
    {
      title: "프린터 대기열 멈춤",
      desc: "인쇄 스풀러(Spooler) 오류 및 인쇄 대기 현상",
      text: "네트워크 프린터로 인쇄를 눌렀는데 인쇄물은 안 나오고 대기열에 계속 밀려있어요."
    }
  ];

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setQuery(searchQuery);
    setLoading(true);
    setResults(null);
    setActiveManual(null);
    setFeedback(null);
    setShowTicketForm(false);

    try {
      const searchResults = await searchManualsAction(searchQuery);
      setResults(searchResults);

      // 검색 키워드 분석 및 가중 누적 (자주 검색된 키워드 축적용)
      const words = searchQuery.split(/\s+/).map(w => w.replace(/[?.!,]/g, "").trim()).filter(w => w.length > 1);
      const updatedKeywords = { ...searchedKeywords };
      words.forEach(word => {
        const isTargetWord = /erp|vpn|outlook|mail|login|printer|spooler|otp|cache|drm|결재|인증|로그인|접속|용량|인쇄|대기열|첨부/i.test(word);
        if (isTargetWord || word.length >= 2) {
          updatedKeywords[word] = (updatedKeywords[word] || 0) + 1;
        }
      });
      setSearchedKeywords(updatedKeywords);
      localStorage.setItem("helpdesk_keywords", JSON.stringify(updatedKeywords));

    } catch (error) {
      alert("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 미해결 티켓 생성 제어 핸들러
  const handleOpenTicketForm = () => {
    setTicketTitle(query);
    if (results && results.length > 0) {
      const bestMatchCategory = results[0].manual.category;
      if (bestMatchCategory.includes("보안") || bestMatchCategory.includes("VPN") || bestMatchCategory.includes("네트워크")) {
        setTicketCategory("네트워크");
      } else if (bestMatchCategory.includes("계정") || bestMatchCategory.includes("로그인") || bestMatchCategory.includes("권한")) {
        setTicketCategory("계정/권한");
      } else if (bestMatchCategory.includes("메일") || bestMatchCategory.includes("결재") || bestMatchCategory.includes("ERP")) {
        setTicketCategory("소프트웨어");
      } else if (bestMatchCategory.includes("프린터") || bestMatchCategory.includes("스캐너") || bestMatchCategory.includes("장비")) {
        setTicketCategory("하드웨어");
      } else {
        setTicketCategory("기타");
      }
    } else {
      setTicketCategory("기타");
    }
    setTicketPriority("보통");
    setTicketDesc("");
    setShowTicketForm(true);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();

    // 8. 일반 사용자 로그인 상태에서만 티켓 생성 가능하게 하되, 로그인 정보가 없으면 명확한 안내 표시
    if (!currentUser) {
      alert("로그인 정보가 존재하지 않습니다. 먼저 우측 상단에서 로그인 단계를 완료해 주십시오.");
      return;
    }

    if (currentUser.role !== "user") {
      alert("장애 티켓 접수는 일반 사용자(임직원) 계정에서만 처리할 수 있습니다. (현재 관리자 계정으로 로그인됨)");
      return;
    }

    if (!ticketDesc.trim()) {
      alert("문의 내용을 상세히 작성해 주십시오.");
      return;
    }

    const matchedManualTitle = results && results.length > 0 ? results[0].manual.title : "참고된 매뉴얼 없음";
    
    // DB의 @id 와 형식을 맞추기 위해 ID 직접 생성 전달
    const newId = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(tickets.length + 1).padStart(3, "0")}`;

    // 3. 요청 body 필수 및 얼리어스 필드 포함 검사 준수
    const newTicketData = {
      id: newId,
      title: ticketTitle || query || "IT 장애 접수 건",
      content: ticketDesc,                 // content
      description: ticketDesc,             // description (DB 스키마)
      category: ticketCategory,
      priority: ticketPriority,
      referencedManual: matchedManualTitle,
      requester: currentUser.name,         // requester
      requesterName: currentUser.name,     // requesterName (DB 스키마)
      department: currentUser.dept,        // department
      requesterDept: currentUser.dept,     // requesterDept (DB 스키마)
      suggestedAction: results && results.length > 0 ? results[0].suggestedSteps : [],  // suggestedAction
      aiSuggestedSteps: results && results.length > 0 ? results[0].suggestedSteps : [], // aiSuggestedSteps (DB 스키마)
      status: "open",
      userId: currentUser.username         // userId 또는 로그인 정보
    };

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTicketData)
      });
      
      if (res.ok) {
        const createdTicket = await res.json();
        // 7. 저장 성공 시 생성된 티켓을 반환하고, 프론트에서 내 문의 대시보드에 즉시 반영
        setTickets([createdTicket, ...tickets]);
        setShowTicketForm(false);
        setFeedback("unsolved");
        alert(`티켓 접수 완료\n[${createdTicket.id}] 티켓이 시스템에 정상 기록되었습니다. 내 문의 대시보드에서 처리 상태를 실시간 모니터링할 수 있습니다.`);
      } else {
        // 9. 제출 실패 시 사용자에게 실제 원인을 알 수 있는 안내 메시지 표시
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || "알 수 없는 서버 측 장애 발생";
        alert(`티켓 생성에 실패했습니다.\n상세 사유: ${errMsg}`);
      }
    } catch (err: any) {
      console.error("티켓 생성 통신 오류:", err);
      alert(`티켓 생성 중 통신 오류가 발생했습니다.\n오류 정보: ${err.message || err.toString()}`);
    }
  };

  // 관리자 기능: 티켓 상태를 처리 중(processing)으로 변경
  const handleSetProcessing = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: "processing" })
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets(tickets.map(t => t.id === ticketId ? updated : t));
        alert("티켓 상태가 '처리 중'으로 변경되었습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다.");
    }
  };

  // 관리자 조치 완료 입력을 위한 모달 오픈
  const handleOpenResolveModal = (ticket: Ticket) => {
    setActiveTicketForResolution(ticket);
    setResolutionComment("");
    setResolverNameInput("IT 담당자 A");
  };

  // 관리자 티켓 상세 조회를 위한 모달 오픈
  const handleOpenDetailModal = (ticket: Ticket) => {
    setActiveTicketForDetail(ticket);
  };

  // 조치 입력 완료 후 최종 해결 완료 처리 핸들러
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicketForResolution) return;
    if (!resolutionComment.trim()) {
      alert("조치 내용을 상세히 기록해 주십시오.");
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${activeTicketForResolution.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: "resolved",
          resolutionComment: resolutionComment.trim(),
          resolverName: resolverNameInput || "IT 담당자",
          resolvedAt: new Date().toISOString()
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets(tickets.map(t => t.id === activeTicketForResolution.id ? updated : t));
        setActiveTicketForResolution(null);
        setResolutionComment("");
        alert(`조치 이력이 등록되었습니다.\n[${activeTicketForResolution.id}] 티켓이 조치완료 상태로 전환되었습니다.`);
      }
    } catch (e) {
      console.error(e);
      alert("오류가 발생했습니다.");
    }
  };

  // 관리자 기능: 티켓 삭제 처리
  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm("해당 티켓 데이터를 정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' });
      if (res.ok) {
        setTickets(tickets.filter(t => t.id !== ticketId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 관리자 기능: 데이터 전체 초기화 (디버깅용 리셋)
  const handleResetData = () => {
    if (confirm("⚠️ 데이터 초기화는 더 이상 지원되지 않습니다 (DB 연동됨). 검색 키워드 이력만 삭제합니다.")) {
      localStorage.removeItem("helpdesk_keywords");
      setSearchedKeywords({});
      alert("검색 이력이 초기화되었습니다.");
    }
  };

  // 오류 유형별 분포 통계 도출
  const categoryStats = {
    "네트워크": tickets.filter(t => t.category === "네트워크").length,
    "계정/권한": tickets.filter(t => t.category === "계정/권한").length,
    "소프트웨어": tickets.filter(t => t.category === "소프트웨어").length,
    "하드웨어": tickets.filter(t => t.category === "하드웨어").length,
    "기타": tickets.filter(t => t.category === "기타").length,
  };

  // 자주 검색된 키워드 정렬 추출
  const sortedKeywords = Object.entries(searchedKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // 사용자별 문의 통계 (관리자용 사용자 진단 뷰)
  const getUserDiagnostics = (): UserDiagnostic[] => {
    const map = new Map<string, Ticket[]>();
    tickets.forEach(t => {
      const key = `${t.requesterName}||${t.requesterDept}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(t);
    });

    const diagnostics: UserDiagnostic[] = [];
    map.forEach((userTickets, key) => {
      const [name, dept] = key.split("||");
      const totalCount = userTickets.length;
      const openCount = userTickets.filter(t => t.status === "open" || t.status === "processing").length;
      const resolvedCount = userTickets.filter(t => t.status === "resolved").length;
      
      const sorted = [...userTickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const recentDescription = sorted[0]?.description || "";

      const catMap: {[key: string]: number} = {};
      userTickets.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + 1;
      });
      const topCategory = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "없음";

      diagnostics.push({
        requesterName: name,
        requesterDept: dept,
        totalCount,
        openCount,
        resolvedCount,
        recentDescription,
        topCategory
      });
    });

    return diagnostics;
  };

  // 일반 사용자 화면 필터링 (본인 티켓만)
  const filteredUserTickets = tickets.filter(t => currentUser && t.requesterName === currentUser.name);

  // 접근 제어 검사 컴포넌트 또는 렌더 쉴드
  const isUnauthorized = 
    currentUser?.role !== "admin" && 
    (mainTab === "admin-dashboard" || mainTab === "user-diagnostics" || mainTab === "manual-management");

  // 마운트 완료 전 로딩 보호막 (Hydration & localStorage 완벽 대기)
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin mb-3"></div>
        <span>ITSM SYSTEM INITIALIZING...</span>
      </div>
    );
  }

  // -------------------- 0. LOGIN LAYOUT (비로그인 시 강제 노출) --------------------
  if (!currentUser) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center min-h-screen bg-slate-950 px-4 py-12 relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-indigo-600/10 rounded-full blur-[100px] -z-10"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[100px] -z-10"></div>

        <div className="glass-panel max-w-md w-full rounded-3xl p-8 border border-slate-850 shadow-2xl relative">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mx-auto mb-3">
              <span className="text-xl">⚙️</span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">ITSM AI Helpdesk</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              역할 기반 사내 장애 매뉴얼 지식관리 & 티켓 처리 플랫폼
            </p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/20 text-rose-400 rounded-xl text-xs text-center mb-4 animate-shake">
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10.5px] font-bold text-slate-400 mb-1 font-mono">USER ID</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="아이디를 입력해 주세요 (user 또는 admin)"
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-[10.5px] font-bold text-slate-400 mb-1 font-mono">PASSWORD</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="비밀번호를 입력해 주세요"
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs tracking-wider transition-all rounded-xl shadow-lg shadow-indigo-500/10 mt-2"
            >
              로그인 🚀
            </button>
          </form>

          {/* Preset User account cards */}
          <div className="mt-6 border-t border-slate-900 pt-5 space-y-2.5">
            <div className="text-[10px] font-bold text-indigo-400 block mb-1 font-mono">🔑 포트폴리오 데모용 계정 정보:</div>
            
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <button
                type="button"
                onClick={() => { setLoginUsername("user"); setLoginPassword("user123"); }}
                className="text-left p-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-850/80 rounded-xl hover:border-slate-700 transition-all"
              >
                <div className="font-bold text-slate-200">일반 사용자</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">user / user123</div>
                <div className="text-[8.5px] text-indigo-400 mt-1">장그래 (영업3팀)</div>
              </button>
              <button
                type="button"
                onClick={() => { setLoginUsername("admin"); setLoginPassword("admin123"); }}
                className="text-left p-2 bg-slate-900/60 hover:bg-slate-900 border border-slate-850/80 rounded-xl hover:border-slate-700 transition-all"
              >
                <div className="font-bold text-slate-200">IT 관리자</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">admin / admin123</div>
                <div className="text-[8.5px] text-purple-400 mt-1">IT 마스터 (운영본부)</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      {/* 1. HEADER BAR: 서비스명, 메뉴 전환 및 로그아웃 */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="font-bold text-white text-lg">⚙️</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                ITSM AI Helpdesk
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  RAG Platform
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                로그인 계정: <span className="font-bold text-slate-200">{currentUser.name}</span>님 ({currentUser.dept} • {currentUser.role === "admin" ? "관리자" : "일반"})
              </p>
            </div>
          </div>
          
          {/* 역할 기반 네비게이션 메뉴 */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setMainTab("chat")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  mainTab === "chat"
                    ? "bg-indigo-600 text-white shadow shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🖥️ AI 진단 콘솔
              </button>

              {/* 일반 사용자 전용 메뉴 */}
              {currentUser.role === "user" && (
                <button
                  onClick={() => setMainTab("my-tickets")}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                    mainTab === "my-tickets"
                      ? "bg-indigo-600 text-white shadow shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  📩 내 문의 대시보드
                  {filteredUserTickets.filter(t => t.status !== "resolved").length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  )}
                </button>
              )}

              {/* 관리자 전용 메뉴 */}
              {currentUser.role === "admin" && (
                <>
                  <button
                    onClick={() => setMainTab("admin-dashboard")}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                      mainTab === "admin-dashboard"
                        ? "bg-indigo-600 text-white shadow shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📊 관리자 대시보드
                    {tickets.filter(t => t.status !== "resolved").length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                    )}
                  </button>
                  <button
                    onClick={() => setMainTab("user-diagnostics")}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                      mainTab === "user-diagnostics"
                        ? "bg-indigo-600 text-white shadow shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    👥 사용자 진단 뷰
                  </button>
                  <button
                    onClick={() => setMainTab("manual-management")}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                      mainTab === "manual-management"
                        ? "bg-indigo-600 text-white shadow shadow-indigo-600/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📁 매뉴얼 관리
                  </button>
                </>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[10.5px] font-bold text-slate-400 hover:text-rose-400 transition-colors"
            >
              로그아웃 🚪
            </button>
          </div>

        </div>
      </header>

      {/* -------------------- 2. ACCESS CONTROL SHIELD (일반 사용자 어드민 직접 접근 제어) -------------------- */}
      {isUnauthorized ? (
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-16 flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 text-2xl mb-4 animate-bounce">
            ⚠️
          </div>
          <h2 className="text-base font-bold text-white mb-2">접근 권한이 없습니다.</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mb-6">
            이 메뉴는 IT Helpdesk 관리자 전용 페이지입니다. 일반 사용자 계정({currentUser.name})으로는 접근하실 수 없습니다.
          </p>
          <button
            onClick={() => setMainTab("chat")}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
          >
            AI 진단 콘솔로 돌아가기
          </button>
        </main>
      ) : (
        <>
          {/* -------------------- 3. CHAT TAB (AI 헬프데스크 질문 콘솔 - 공용) -------------------- */}
          {mainTab === "chat" && (
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT SIDEBAR: 카테고리 현황 & 지식 매뉴얼 목록 */}
              <aside className="lg:col-span-3 order-2 lg:order-1 flex flex-col gap-5">
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span>📊</span> 카테고리 현황
                  </h3>
                  <div className="space-y-1.5">
                    {Array.from(new Set(allManuals.map(m => m.category))).map(cat => {
                      const count = allManuals.filter(m => m.category === cat).length;
                      return (
                        <div key={cat} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-900/30 border border-slate-900/50">
                          <span className="text-slate-300 font-medium">{cat}</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 border border-slate-700/50 font-bold font-mono">
                            {count} Docs
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-5 flex flex-col min-h-[300px] lg:flex-1">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span>📂</span> 지식 매뉴얼 ({allManuals.length})
                  </h3>
                  {allManuals.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500 flex-1 flex items-center justify-center">
                      매뉴얼이 비어 있습니다.
                    </div>
                  ) : (
                    <div className="space-y-2.5 overflow-y-auto max-h-[480px] lg:max-h-[600px] pr-1 scrollbar-thin flex-1">
                      {allManuals.map((manual) => (
                        <button
                          key={manual.id}
                          onClick={() => {
                            setActiveManual(manual);
                            setManualDetailTab("ai");
                          }}
                          className="w-full text-left p-3 rounded-xl bg-slate-900/40 hover:bg-indigo-950/20 hover:border-indigo-500/30 border border-slate-800/80 transition-all flex flex-col gap-1 group"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              {manual.category}
                            </span>
                            <span className="text-[8px] text-slate-600 font-mono group-hover:text-indigo-400/80">
                              {manual.id}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors truncate">
                            {manual.title}
                          </h4>
                          <span className="text-[9px] text-slate-500 font-mono block truncate">
                            📄 {manual.filePath.split(/[\\/]/).pop()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              {/* CENTER PANEL: 질문 입력 및 AI 장애 분석 결과 */}
              <section className="lg:col-span-6 order-1 lg:order-2 flex flex-col gap-5">
                
                {/* SEARCH INPUT CONSOLE */}
                <div className="glass-panel rounded-2xl p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl -z-10"></div>
                  
                  <h2 className="text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">장애 자연어 진단 콘솔</h2>
                  <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                    오류 문구나 기기 장애 현상을 입력해 주시면 RAG 엔진이 즉시 사내 대응 지침 매뉴얼을 찾아 매칭해 드립니다.
                  </p>

                  <form onSubmit={(e) => { e.preventDefault(); handleSearch(query); }} className="space-y-4">
                    <div className="relative">
                      <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="예: ERP 비밀번호를 5번 잘못 입력해서 계정이 잠겼어요. 어떻게 해야 하나요?"
                        className="w-full h-24 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-xs resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSearch(query);
                          }
                        }}
                      />
                      <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <span className="text-[9px] text-slate-500 hidden sm:inline">Enter로 질문 전송</span>
                        <button
                          type="submit"
                          disabled={loading || !query.trim()}
                          className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-[10.5px] tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {loading ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                              진단 중...
                            </>
                          ) : (
                            <>
                              <span>진단 실행</span>
                              <span>🚀</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* PRESETS */}
                  <div className="mt-4">
                    <span className="text-[10px] font-semibold text-indigo-400 block mb-2 font-mono">💡 자주 발생하는 시나리오 테스트:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {recommendedQueries.map((item, index) => (
                        <button
                          key={index}
                          onClick={() => handleSearch(item.text)}
                          className="text-left p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 hover:bg-slate-900/90 hover:border-slate-700 transition-all group"
                        >
                          <span className="text-[10.5px] font-bold text-slate-200 group-hover:text-indigo-400 transition-colors block mb-0.5">
                            {item.title}
                          </span>
                          <span className="text-[9px] text-slate-500 line-clamp-1 leading-normal">
                            {item.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* LOADING */}
                {loading && (
                  <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-center min-h-[300px] animate-pulse">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-200 text-xs">RAG 단락 매칭 및 조치 조견표 합성 중...</h3>
                      <p className="text-[10.5px] text-slate-400 mt-1 max-w-xs leading-normal">
                        사내 보안 규정에 맞춘 마스킹 처리와 가명화가 자동으로 적용됩니다.
                      </p>
                    </div>
                  </div>
                )}

                {/* ANSWER CARD */}
                {!loading && results !== null && (
                  <div className="space-y-5">
                    {results.length === 0 ? (
                      <div className="glass-panel rounded-2xl p-6 text-center border-l-4 border-l-rose-500/80">
                        <div className="text-3xl mb-2">⚠️</div>
                        <h3 className="font-bold text-slate-200 text-sm">관련 매뉴얼을 찾을 수 없습니다.</h3>
                        <p className="text-[10.5px] text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                          입력하신 증상의 매칭 점수가 최하 임계값(15 pts)에 미달되어 오답 방지를 위해 답변을 노출하지 않습니다.
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                          <button
                            onClick={handleOpenTicketForm}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
                          >
                            📩 헬프데스크 티켓 접수
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="glass-panel rounded-2xl border-l-4 border-l-indigo-500 p-5 relative overflow-hidden">
                          <div className="absolute top-4 right-4">
                            <span className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
                              RAG Synthesis
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mb-4">
                            <span className="text-base">✨</span>
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">AI 분석 최적 해결 방안</h3>
                          </div>

                          {/* 카테고리 */}
                          <div className="mb-5 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-between">
                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[10.5px] text-slate-400">자동 분류 유형:</span>
                                <span className="text-[10.5px] font-bold text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded border border-emerald-500/25">
                                  {results[0].classifiedCategory || "기타"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10.5px] text-slate-400">참조 매뉴얼 분류:</span>
                                <span className="text-[10.5px] font-bold text-indigo-300 bg-indigo-500/15 px-2.5 py-0.5 rounded border border-indigo-500/25">
                                  {results[0].manual.category}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 font-mono">
                              <span className="text-[9px] text-slate-500">ID: {results[0].manual.id.split("-")[0]}</span>
                              {results[0].relevance !== undefined && (
                                <span className="text-[9.5px] font-bold text-indigo-400">
                                  적합도: {results[0].relevance}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 예상 원인 */}
                          <div className="mb-5">
                            <h4 className="text-[11.5px] font-bold text-slate-300 mb-2.5 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              예상 원인 분석
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                              {results[0].expectedCauses.map((cause, cIdx) => (
                                <div key={cIdx} className="text-[10.5px] text-slate-400 bg-slate-950/40 border border-slate-900 p-2.5 rounded-lg flex items-start gap-2">
                                  <span className="text-rose-400 mt-0.5">•</span>
                                  <span className="leading-relaxed">{cause}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 단계별 조치 절차 */}
                          <div className="mb-5 border-t border-slate-900 pt-4">
                            <h4 className="text-[11.5px] font-bold text-slate-300 mb-3 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                              단계별 조치 절차
                            </h4>
                            <div className="space-y-4 pl-1">
                              {results[0].suggestedSteps.map((step, idx) => {
                                const parts = step.split("\n");
                                const title = parts[0];
                                const details = parts.slice(1);

                                const cleanTitle = title
                                  .replace(/^###\s+/, "")
                                  .replace(/^\[?단계\s*\d+\]?\s*/i, "")
                                  .replace(/^\d+단계\s*/i, "")
                                  .replace(/^\d+[\.\s\-]+\s*/, "")
                                  .replace(/^[-*•]\s*/, "")
                                  .trim();

                                return (
                                  <div key={idx} className="relative pl-6 border-l border-slate-800 pb-3 last:pb-0">
                                    <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-slate-950 border-2 border-indigo-500 flex items-center justify-center">
                                      <span className="text-[8px] font-bold text-indigo-400">{idx + 1}</span>
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-200 leading-relaxed break-keep">
                                      {renderTextWithCode(cleanTitle)}
                                    </h4>
                                    {details.length > 0 && (
                                      <div className="mt-2 space-y-1.5 pl-3 border-l border-slate-800/40">
                                        {details.map((detail, dIdx) => {
                                          const cleanDetail = detail.trim().replace(/^[-*•]\s+/, "");
                                          return (
                                            <p 
                                              key={dIdx} 
                                              className="text-[10.5px] text-slate-400 leading-relaxed whitespace-pre-line break-keep"
                                            >
                                              {renderTextWithCode(cleanDetail)}
                                            </p>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 추가 확인 사항 */}
                          <div className="mb-5 border-t border-slate-900 pt-4">
                            <h4 className="text-[11.5px] font-bold text-slate-300 mb-2.5 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              추가 확인 사항 및 문의처
                            </h4>
                            <div className="space-y-1.5">
                              {results[0].additionalChecks.map((check, chIdx) => (
                                <div key={chIdx} className="text-[10.5px] text-slate-400 bg-emerald-950/10 border border-emerald-500/10 px-3 py-2 rounded-lg flex items-center gap-2">
                                  <span className="text-emerald-400 font-bold">✓</span>
                                  <span>{check}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 피드백 버튼 */}
                          <div className="border-t border-slate-900 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <span className="text-[10px] text-slate-500 font-medium">이 조치 가이드가 장애를 해결하는 데 도움이 되었습니까?</span>
                            {feedback === null ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setFeedback("solved")}
                                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-semibold transition-all shadow flex items-center gap-1"
                                >
                                  <span>👍</span> 해결됨
                                </button>
                                <button
                                  onClick={handleOpenTicketForm}
                                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition-all border border-slate-700 flex items-center gap-1"
                                >
                                  <span>👎</span> 미해결
                                </button>
                              </div>
                            ) : (
                              <div className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
                                <span>✨</span>
                                {feedback === "solved" 
                                  ? "피드백 감사합니다! IT 지식베이스 평가 모델에 자동 학습 반영됩니다." 
                                  : "티켓 접수가 완료되었습니다! 미해결 매뉴얼 보강 목록으로 자동 검토됩니다."}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 미해결 티켓 생성 폼 */}
                        {showTicketForm && (
                          <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-amber-500 animate-fadeIn">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span>📩</span> 미해결 장애 티켓 접수 (IT Helpdesk Ticket)
                              </h3>
                              <button 
                                type="button" 
                                onClick={() => setShowTicketForm(false)}
                                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                              >
                                ✕ 취소
                              </button>
                            </div>

                            <form onSubmit={handleCreateTicket} className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">문의 제목</label>
                                  <input 
                                    type="text"
                                    value={ticketTitle}
                                    onChange={(e) => setTicketTitle(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">참고된 매뉴얼</label>
                                  <input 
                                    type="text"
                                    value={results && results.length > 0 ? results[0].manual.title : "참고 매뉴얼 없음"}
                                    className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed focus:outline-none"
                                    readOnly
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">오류 유형</label>
                                  <select 
                                    value={ticketCategory}
                                    onChange={(e) => setTicketCategory(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                                  >
                                    <option value="네트워크">네트워크</option>
                                    <option value="계정/권한">계정/권한</option>
                                    <option value="소프트웨어">소프트웨어</option>
                                    <option value="하드웨어">하드웨어</option>
                                    <option value="기타">기타</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">우선순위</label>
                                  <select 
                                    value={ticketPriority}
                                    onChange={(e) => setTicketPriority(e.target.value as any)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                                  >
                                    <option value="낮음">낮음</option>
                                    <option value="보통">보통</option>
                                    <option value="높음">높음</option>
                                    <option value="긴급">긴급</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">요청자</label>
                                  <input 
                                    type="text"
                                    value={currentUser.name}
                                    className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed focus:outline-none font-semibold"
                                    readOnly
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">요청부서</label>
                                  <input 
                                    type="text"
                                    value={currentUser.dept}
                                    className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed focus:outline-none font-semibold"
                                    readOnly
                                  />
                                </div>
                              </div>

                              <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">상세 문의 내용</label>
                                  <textarea 
                                    value={ticketDesc}
                                    onChange={(e) => setTicketDesc(e.target.value)}
                                    placeholder="장애를 조치하는 과정에서 겪은 상세한 문제 증상이나 에러 메시지를 기록해 주세요."
                                    className="w-full h-24 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                                    required
                                  />
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                  <button 
                                    type="button" 
                                    onClick={() => setShowTicketForm(false)}
                                    className="px-4 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 text-[11px] font-semibold transition-colors"
                                  >
                                    취소
                                  </button>
                                  <button 
                                    type="submit"
                                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition-colors shadow-md shadow-amber-600/10"
                                  >
                                    티켓 제출 🚀
                                  </button>
                                </div>
                            </form>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* RIGHT SIDEBAR: 관련 문서 정보 근거 */}
              <aside className="lg:col-span-3 order-3 flex flex-col gap-5">
                {results === null || results.length === 0 ? (
                  <div className="glass-panel rounded-2xl p-5 border border-dashed border-slate-800 flex flex-col items-center justify-center text-center min-h-[300px]">
                    <div className="text-2xl mb-2 opacity-50">🔍</div>
                    <h3 className="text-xs font-bold text-slate-400 mb-1.5">진단 근거 패널</h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed max-w-[180px]">
                      질문을 분석하면 연관도가 검출된 PDF 구절과 참조 매뉴얼 출처가 이곳에 정렬됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>📍</span> 매칭 문서 근거 ({Math.min(results.length - 1, 3)}건)
                    </h3>
                    
                    <div className="space-y-4 max-h-[500px] lg:max-h-[650px] overflow-y-auto pr-1 scrollbar-thin">
                      {results.slice(1).slice(0, 3).map((result, idx) => (
                        <div key={result.manual.id} className="glass-panel rounded-xl p-4 border border-slate-800 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[8.5px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              {result.manual.category}
                            </span>
                            <span className="text-[9px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded">
                              {result.relevance ?? 0}% 적합
                            </span>
                          </div>

                          <h4 className="text-xs font-bold text-slate-200 leading-snug">
                            {result.manual.title.replace(/\(연관 단락 기반.*\)/, "")}
                          </h4>

                          <div className="text-[9px] text-slate-500 font-mono space-y-0.5 border-t border-slate-900 pt-2">
                            <div className="truncate">📄 파일: {result.manual.filePath.split(/[\\/]/).pop()}</div>
                            <div>⏰ 최종갱신: {result.manual.lastUpdated}</div>
                            <div>👤 작성자: {result.manual.author}</div>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {result.matchedKeywords.slice(0, 3).map((kw, kwIdx) => (
                              <span key={kwIdx} className="text-[8.5px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
                                #{kw}
                              </span>
                            ))}
                          </div>

                          {result.matchedSnippets.length > 0 && (
                            <div className="p-2.5 rounded bg-slate-950/60 border-l-2 border-indigo-500 text-[10px] text-slate-400 leading-normal">
                              <span className="font-semibold text-indigo-300 block text-[9.5px] mb-1">📌 PDF 참조 문장:</span>
                              <ul className="list-disc pl-3 space-y-1">
                                {result.matchedSnippets.slice(0, 2).map((sn, sIdx) => (
                                  <li key={sIdx} className="break-keep">
                                    {highlightText(sn, query, result.matchedKeywords)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <button
                            onClick={() => {
                              const baseId = result.manual.id.split("-")[0];
                              const matchedOriginal = allManuals.find(m => m.id === baseId);
                              if (matchedOriginal) {
                                setActiveManual(matchedOriginal);
                                setManualDetailTab("raw");
                              } else {
                                setActiveManual(result.manual);
                                setManualDetailTab("raw");
                              }
                            }}
                            className="w-full py-1.5 text-center rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-[9.5px] transition-colors"
                          >
                            매뉴얼 원문 전문 보기 ↗
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </aside>

            </main>
          )}

          {/* -------------------- 4. MY TICKETS TAB (일반 사용자 전용: 내 문의 대시보드) -------------------- */}
          {mainTab === "my-tickets" && currentUser.role === "user" && (
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
              <div className="glass-panel rounded-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>📩</span> 내 문의 대시보드 (My ITSM Tickets)
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {currentUser.name}님이 사내 AI 헬프데스크를 통해 접수한 실시간 장애 목록 및 조치 이력입니다.
                    </p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl text-xs flex gap-5">
                    <div>
                      <span className="text-slate-400 mr-1.5">접수:</span>
                      <span className="font-bold text-indigo-400 font-mono">
                        {filteredUserTickets.filter(t => t.status === "open").length} 건
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 mr-1.5">처리 중:</span>
                      <span className="font-bold text-amber-400 font-mono">
                        {filteredUserTickets.filter(t => t.status === "processing").length} 건
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 mr-1.5">완료:</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        {filteredUserTickets.filter(t => t.status === "resolved").length} 건
                      </span>
                    </div>
                  </div>
                </div>

                {filteredUserTickets.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-xs border border-dashed border-slate-850 rounded-xl bg-slate-900/10">
                    접수하신 문의 내역이 없습니다. AI 진단 콘솔에서 해결되지 않는 문제를 티켓으로 상신해 보세요!
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-slate-400 text-[10px] uppercase font-mono bg-slate-950/20">
                          <th className="py-2.5 px-3">티켓 ID</th>
                          <th className="py-2.5 px-3">문의 제목</th>
                          <th className="py-2.5 px-3">유형</th>
                          <th className="py-2.5 px-3">우선순위</th>
                          <th className="py-2.5 px-3">상태</th>
                          <th className="py-2.5 px-3">생성 일시</th>
                          <th className="py-2.5 px-3">완료 일시</th>
                          <th className="py-2.5 px-3">관리자 조치 내용 / 상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60">
                        {filteredUserTickets.map(ticket => (
                          <tr key={ticket.id} className="hover:bg-slate-900/20 transition-colors">
                            <td className="py-3 px-3 font-mono text-indigo-400 font-bold whitespace-nowrap">{ticket.id}</td>
                            <td className="py-3 px-3 max-w-[200px]">
                              <button
                                onClick={() => handleOpenDetailModal(ticket)}
                                className="text-left font-semibold text-slate-200 hover:text-indigo-400 transition-colors truncate block w-full"
                                title="티켓 상세내역 보기"
                              >
                                {ticket.title}
                              </button>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[200px]" title={ticket.referencedManual}>📚 참고: {ticket.referencedManual}</span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                                {ticket.category}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                ticket.priority === "긴급" 
                                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  : "bg-slate-800 text-slate-400 border-slate-750"
                              }`}>
                                {ticket.priority}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                ticket.status === "open"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : ticket.status === "processing"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}>
                                {ticket.status === "open" ? "접수" : ticket.status === "processing" ? "처리 중" : "완료"}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-500 font-mono">{ticket.createdAt}</td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-500 font-mono">{ticket.resolvedAt || "-"}</td>
                            <td className="py-3 px-3 max-w-[250px]">
                              {ticket.status === "resolved" ? (
                                <div className="text-[11px] text-slate-300 bg-emerald-950/15 border border-emerald-500/10 px-2.5 py-1.5 rounded-lg line-clamp-2" title={ticket.resolutionComment}>
                                  <span className="font-bold text-emerald-400 mr-1">[조치]:</span>
                                  {ticket.resolutionComment}
                                </div>
                              ) : ticket.status === "processing" ? (
                                <span className="text-[10.5px] text-amber-400 italic">IT 담당자가 문제를 확인하고 분석 중입니다.</span>
                              ) : (
                                <span className="text-[10.5px] text-slate-500 italic">대기열에 대기 중입니다.</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          )}

          {/* -------------------- 5. ADMIN TICKETS TAB (관리자 전용: 티켓 대시보드) -------------------- */}
          {mainTab === "admin-dashboard" && currentUser.role === "admin" && (
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT: 요약 메트릭 & 티켓 테이블 */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-indigo-500">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">전체 접수 티켓 수</div>
                    <div className="text-3xl font-extrabold text-white mt-1">{tickets.length} <span className="text-xs font-normal text-slate-400">건</span></div>
                    <div className="text-[9px] text-slate-500 mt-2">ITSM에 영구 누적된 모든 장애 티켓</div>
                  </div>
                  <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-amber-500">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">미해결 장애 티켓</div>
                    <div className="text-3xl font-extrabold text-amber-400 mt-1">
                      {tickets.filter(t => t.status === "open" || t.status === "processing").length} <span className="text-xs font-normal text-slate-400">건</span>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-2">대기 중이거나 처리 중인 문의 건</div>
                  </div>
                  <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-emerald-500">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">해결 완료 티켓</div>
                    <div className="text-3xl font-extrabold text-emerald-400 mt-1">{tickets.filter(t => t.status === "resolved").length} <span className="text-xs font-normal text-slate-400">건</span></div>
                    <div className="text-[9px] text-slate-500 mt-2">IT 지원팀 조치 완료 승인 티켓</div>
                  </div>
                </div>

                {/* Ticket Management Table */}
                <div className="glass-panel rounded-2xl p-5 flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <span>📋</span> 최근 접수된 장애 티켓 목록 ({tickets.length}건)
                    </h3>
                    <button
                      onClick={handleResetData}
                      className="text-[9px] text-slate-500 hover:text-rose-400 bg-slate-900/60 hover:bg-rose-955/20 border border-slate-800 hover:border-rose-900/30 px-2 py-1 rounded transition-all font-semibold"
                      title="모든 티켓 및 검색 키워드 내역을 초기 샘플 데이터로 리셋합니다."
                    >
                      데이터 초기화 🔄
                    </button>
                  </div>
                  
                  {tickets.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      접수된 헬프데스크 티켓이 없습니다. 사용자 뷰에서 미해결 티켓을 등록해 보세요!
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-400 text-[10px] uppercase font-mono bg-slate-950/20">
                            <th className="py-2.5 px-3">티켓 ID</th>
                            <th className="py-2.5 px-3">문의 제목</th>
                            <th className="py-2.5 px-3">유형</th>
                            <th className="py-2.5 px-2">우선순위</th>
                            <th className="py-2.5 px-3">요청자 (부서)</th>
                            <th className="py-2.5 px-3">상태</th>
                            <th className="py-2.5 px-3 text-right">조치 액션</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60">
                          {tickets.map(ticket => (
                            <tr key={ticket.id} className="hover:bg-slate-900/30 transition-colors">
                              <td className="py-3 px-3 font-mono text-indigo-400 font-bold whitespace-nowrap">{ticket.id}</td>
                              <td className="py-3 px-3 max-w-[180px]">
                                <button
                                  onClick={() => handleOpenDetailModal(ticket)}
                                  className="text-left font-semibold text-slate-200 hover:text-indigo-400 transition-colors truncate block w-full"
                                  title="티켓 상세내역 보기"
                                >
                                  {ticket.title}
                                </button>
                                <div className="text-[10px] text-slate-500 truncate" title={ticket.referencedManual}>📚 {ticket.referencedManual}</div>
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                                  {ticket.category}
                                </span>
                              </td>
                              <td className="py-3 px-2 whitespace-nowrap">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  ticket.priority === "긴급" 
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
                                    : ticket.priority === "높음"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : ticket.priority === "보통"
                                    ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                                    : "bg-slate-800 text-slate-400 border-slate-700"
                                }`}>
                                  {ticket.priority}
                                </span>
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                                {ticket.requesterName} <span className="text-[10px] text-slate-500">({ticket.requesterDept})</span>
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  ticket.status === "open"
                                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                    : ticket.status === "processing"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                }`}>
                                  {ticket.status === "open" ? "접수" : ticket.status === "processing" ? "처리 중" : "완료"}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <div className="flex justify-end gap-1.5">
                                  {ticket.status === "open" && (
                                    <>
                                      <button
                                        onClick={() => handleSetProcessing(ticket.id)}
                                        className="px-2.5 py-1 bg-amber-600/80 hover:bg-amber-500 text-white rounded text-[10px] font-bold transition-colors"
                                      >
                                        처리 진행
                                      </button>
                                      <button
                                        onClick={() => handleOpenResolveModal(ticket)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition-colors"
                                      >
                                        조치 완료
                                      </button>
                                    </>
                                  )}
                                  {ticket.status === "processing" && (
                                    <button
                                      onClick={() => handleOpenResolveModal(ticket)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition-colors"
                                    >
                                      조치 완료
                                    </button>
                                  )}
                                  {ticket.status === "resolved" && (
                                    <button
                                      onClick={() => handleOpenDetailModal(ticket)}
                                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-indigo-400 rounded text-[10px] font-bold transition-colors border border-slate-700"
                                    >
                                      이력 조회
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteTicket(ticket.id)}
                                    className="px-2 py-1 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded text-[10px] transition-colors border border-slate-750"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>

              {/* RIGHT: 오류 유형별 점유 비율 & 자주 검색된 키워드 순위 */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span>⚡</span> 오류 유형별 통계
                  </h3>
                  
                  <div className="space-y-4">
                    {Object.entries(categoryStats).map(([cat, count]) => {
                      const percentage = tickets.length > 0 ? Math.round((count / tickets.length) * 100) : 0;
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-semibold">{cat}</span>
                            <span className="text-slate-400 font-mono">{count}건 ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" 
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span>🔥</span> 자주 검색된 키워드 랭킹
                  </h3>

                  {sortedKeywords.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      검색 이력이 아직 누적되지 않았습니다.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {sortedKeywords.map(([kw, count], idx) => (
                        <div key={kw} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-900/50 border border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                              idx === 0 
                                ? "bg-amber-500/20 text-amber-400" 
                                : idx === 1 
                                ? "bg-slate-300/20 text-slate-300" 
                                : idx === 2
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-slate-800 text-slate-400"
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-slate-200 font-medium">#{kw}</span>
                          </div>
                          <span className="text-[10px] text-indigo-400 font-bold font-mono bg-indigo-950/40 px-2 py-0.5 rounded">
                            {count}회 검색
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </main>
          )}

          {/* -------------------- 6. USER DIAGNOSTICS TAB (관리자 전용: 사용자 진단 뷰) -------------------- */}
          {mainTab === "user-diagnostics" && currentUser.role === "admin" && (
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
              <div className="glass-panel rounded-2xl p-6">
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>👥</span> 사용자별 장애 문의 현황 (User Diagnostics)
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-1">
                    각 사원별 누적 장애 문의 수와 처리 현황, 최근 문의 세부 내용 및 최다 빈출 오류 유형 통계입니다.
                  </p>
                </div>

                {getUserDiagnostics().length === 0 ? (
                  <div className="text-center py-16 text-slate-500 text-xs">
                    접수된 사용자별 문의 데이터가 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-slate-400 text-[10px] uppercase font-mono bg-slate-950/20">
                          <th className="py-2.5 px-3">요청자</th>
                          <th className="py-2.5 px-3">요청부서</th>
                          <th className="py-2.5 px-3">전체 문의 수</th>
                          <th className="py-2.5 px-3">미해결 문의 수</th>
                          <th className="py-2.5 px-3">완료 문의 수</th>
                          <th className="py-2.5 px-3">최근 문의 내용</th>
                          <th className="py-2.5 px-3">자주 발생하는 오류 유형</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60">
                        {getUserDiagnostics().map((uDiag, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/20 transition-colors">
                            <td className="py-3.5 px-3 font-semibold text-slate-200">{uDiag.requesterName}</td>
                            <td className="py-3.5 px-3 text-slate-400">{uDiag.requesterDept}</td>
                            <td className="py-3.5 px-3 font-mono font-bold text-slate-350">{uDiag.totalCount} 건</td>
                            <td className="py-3.5 px-3 font-mono text-amber-400 font-bold">{uDiag.openCount} 건</td>
                            <td className="py-3.5 px-3 font-mono text-emerald-400 font-bold">{uDiag.resolvedCount} 건</td>
                            <td className="py-3.5 px-3 max-w-[240px]">
                              <p className="truncate text-slate-400" title={uDiag.recentDescription}>
                                {uDiag.recentDescription || "-"}
                              </p>
                            </td>
                            <td className="py-3.5 px-3">
                              <span className="text-[10px] bg-indigo-950/40 text-indigo-300 border border-indigo-900/40 px-2 py-0.5 rounded font-medium">
                                {uDiag.topCategory}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          )}

          {/* -------------------- 7. MANUAL MANAGEMENT TAB (관리자 전용: 매뉴얼 관리) -------------------- */}
          {mainTab === "manual-management" && currentUser.role === "admin" && (
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              
              {/* 왼쪽: PDF 업로드 폼 */}
              <div className="lg:col-span-1 space-y-6">
                <div className="glass-panel rounded-2xl p-5 border border-slate-800">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span>📤</span> 새 PDF 매뉴얼 업로드
                  </h3>
                  
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!uploadFile) {
                        alert("PDF 파일을 선택해 주세요.");
                        return;
                      }
                      if (!uploadTitle.trim() || !uploadDesc.trim()) {
                        alert("문서 제목과 설명을 입력해 주세요.");
                        return;
                      }
                      setIsUploading(true);
                      const formData = new FormData();
                      formData.append("file", uploadFile);
                      formData.append("title", uploadTitle.trim());
                      formData.append("category", uploadCategory);
                      formData.append("description", uploadDesc.trim());

                      try {
                        const res = await fetch("/api/admin/manuals", {
                          method: "POST",
                          body: formData,
                        });
                        if (res.ok) {
                          const newManual = await res.json();
                          if (newManual.status === "failed") {
                            alert(`경고: 매뉴얼 업로드에는 성공했으나 PDF 파싱에 실패했습니다.\n사유: ${newManual.errorMessage}`);
                          } else {
                            alert("성공: PDF 매뉴얼이 정상 업로드 및 파싱되어 검색 대상에 자동 반영되었습니다! 🎉");
                          }
                          setUploadFile(null);
                          setUploadTitle("");
                          setUploadDesc("");
                          const fileInput = document.getElementById("manual-file-input") as HTMLInputElement;
                          if (fileInput) fileInput.value = "";
                          
                          fetchUploadedManuals();
                          fetchAllManuals();
                        } else {
                          const errorData = await res.json();
                          alert(`업로드 실패: ${errorData.error || "알 수 없는 오류가 발생했습니다."}`);
                        }
                      } catch (err) {
                        console.error(err);
                        alert("업로드 중 통신 에러가 발생했습니다.");
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                    className="space-y-4 text-xs"
                  >
                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-400 mb-1.5">PDF 파일 선택 (필수)</label>
                      <input
                        id="manual-file-input"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-slate-300 focus:outline-none file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 transition-all cursor-pointer"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-400 mb-1">문서 제목 (필수)</label>
                      <input
                        type="text"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="예: 그룹웨어 파일 첨부 제한 해결 매뉴얼"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-400 mb-1">카테고리 (필수)</label>
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="계정/권한">계정/권한</option>
                        <option value="네트워크/보안">네트워크/보안</option>
                        <option value="시스템/메일">시스템/메일</option>
                        <option value="하드웨어/주변기기">하드웨어/주변기기</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-slate-400 mb-1">문서 설명 (검색 대상에 포함 - 필수)</label>
                      <textarea
                        value={uploadDesc}
                        onChange={(e) => setUploadDesc(e.target.value)}
                        placeholder="이 매뉴얼에 대한 간략한 원인 설명 또는 조치 가이드 요약을 입력해 주세요. (RAG 검색 및 생성 가중치에 직접 반영됩니다)"
                        className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isUploading}
                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-semibold text-xs tracking-wider transition-all rounded-xl shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isUploading ? (
                        <>
                          <span className="w-3.5 h-3.5 rounded-full border border-white/20 border-t-white animate-spin"></span>
                          파싱 및 업로드 중...
                        </>
                      ) : (
                        "PDF 매뉴얼 등록 및 파싱 실행 🚀"
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* 오른쪽: 업로드한 PDF 목록 */}
              <div className="lg:col-span-2 space-y-6">
                <div className="glass-panel rounded-2xl p-6 border border-slate-800">
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>📁</span> 업로드한 PDF 매뉴얼 목록 ({uploadedManuals.length})
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-1">
                      관리자가 직접 추가한 외부 PDF 지식 베이스 목록입니다. 파싱 성공 시 AI 진단 콘솔 RAG 검색 대상에 즉시 반영됩니다.
                    </p>
                  </div>

                  {uploadedManuals.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                      🏢 업로드된 사용자 정의 PDF 매뉴얼이 없습니다.<br />
                      좌측 폼을 이용해 새로운 매뉴얼 문서를 등록해 보세요.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-400 text-[10px] uppercase font-mono bg-slate-950/20">
                            <th className="py-2.5 px-3">문서 제목 / 파일명</th>
                            <th className="py-2.5 px-3">카테고리</th>
                            <th className="py-2.5 px-3">등록 일시</th>
                            <th className="py-2.5 px-3 text-center">파싱 상태</th>
                            <th className="py-2.5 px-3 text-center">관리</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-300">
                          {uploadedManuals.map((man) => (
                            <tr key={man.id} className="hover:bg-slate-900/20 transition-colors">
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-200">{man.title}</div>
                                <div className="text-[9.5px] text-slate-500 font-mono mt-0.5 truncate max-w-xs" title={man.fileName}>
                                  📄 {man.fileName}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded font-medium text-slate-400">
                                  {man.category}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-450 font-mono text-[10.5px]">
                                {new Date(man.createdAt).toLocaleString("ko-KR")}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {man.status === "success" ? (
                                  <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    성공
                                  </span>
                                ) : (
                                  <span 
                                    className="inline-flex items-center gap-1 text-[9.5px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/25 cursor-help"
                                    title={man.errorMessage || "파싱 오류"}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    실패
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm(`[${man.fileName}] 매뉴얼을 정말 삭제하시겠습니까?\n삭제 후에는 검색 대상에서 즉시 제외됩니다.`)) return;
                                    try {
                                      const res = await fetch(`/api/admin/manuals/${man.id}`, {
                                        method: "DELETE",
                                      });
                                      if (res.ok) {
                                        alert("매뉴얼이 성공적으로 삭제되었습니다.");
                                        fetchUploadedManuals();
                                        fetchAllManuals();
                                      } else {
                                        alert("삭제에 실패했습니다.");
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      alert("삭제 중 오류가 발생했습니다.");
                                    }
                                  }}
                                  className="px-2 py-1 rounded bg-rose-950/20 hover:bg-rose-900 border border-rose-900/30 text-rose-400 hover:text-white transition-all text-[10px] cursor-pointer"
                                >
                                  삭제 🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </main>
          )}
        </>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {activeManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-fadeIn">
          <div className="glass-panel rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-800 animate-scaleUp">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {activeManual.category}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ID: {activeManual.id} ({activeManual.filePath.split(/[\\/]/).pop()})
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{activeManual.title}</h3>
              </div>
              <button
                onClick={() => setActiveManual(null)}
                className="p-1 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors text-xs"
              >
                ✕ 닫기
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 border-b border-slate-800 bg-slate-950/40 flex gap-4">
              <button
                onClick={() => setManualDetailTab("ai")}
                className={`py-3 text-xs font-semibold border-b-2 transition-all ${
                  manualDetailTab === "ai"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🤖 조치 핵심요약 (Action Plan)
              </button>
              <button
                onClick={() => setManualDetailTab("raw")}
                className={`py-3 text-xs font-semibold border-b-2 transition-all ${
                  manualDetailTab === "raw"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                📄 원문 매뉴얼 보기 (Full Text)
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 text-slate-300 text-xs">
              {manualDetailTab === "raw" ? (
                <div 
                  className="manual-content whitespace-pre-line"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(activeManual.content) }}
                />
              ) : (
                <div className="space-y-5">
                  <div className="p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                    <h4 className="text-xs font-bold text-indigo-400 mb-1">장애 요약 및 정보</h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      이 문서는 <span className="text-indigo-400 font-bold">{activeManual.category}</span> 분야의 장애 대응 매뉴얼이며, 
                      최종 갱신 담당자는 <span className="text-slate-200 font-medium">{activeManual.author}</span>입니다. 
                      관련 키워드는 다음과 같습니다: {activeManual.keywords.map(k => `#${k}`).join(", ")}
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-200 border-b border-slate-800 pb-1.5">권장 가이드라인 절차 요약</h4>
                    <div className="space-y-3">
                      {activeManual.content.split("\n")
                        .filter(line => line.match(/^###\s+\[?단계/) || line.match(/^###\s+\d+단계/))
                        .map((step, idx) => (
                          <div key={idx} className="flex gap-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                            <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono text-xs shrink-0 mt-0.5">
                              {idx + 1}
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-slate-200">{step.replace(/^###\s+/, "")}</h5>
                              <p className="text-[10px] text-slate-400 mt-1">
                                상세 프로세스는 원문 매뉴얼 탭을 확인해 주십시오.
                              </p>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-mono">
                문서 최종 갱신일: {activeManual.lastUpdated}
              </span>
              <button
                onClick={() => setActiveManual(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 관리자 조치 내용 입력 모달 */}
      {activeTicketForResolution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-fadeIn">
          <div className="glass-panel rounded-2xl max-w-lg w-full flex flex-col shadow-2xl border border-slate-800 p-6 animate-scaleUp">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>🛠️</span> 헬프데스크 장애 조치 이력 등록
            </h3>
            <p className="text-[10.5px] text-slate-400 mb-4 leading-normal">
              티켓 <span className="text-indigo-400 font-bold font-mono">{activeTicketForResolution.id}</span> 번 장애를 해결하기 위한 실제 처리 행위를 상세히 기록해 주십시오.
            </p>

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-850 mb-4 text-[10.5px] space-y-1">
              <div><span className="text-slate-500">문의 제목:</span> <span className="text-slate-300 font-semibold">{activeTicketForResolution.title}</span></div>
              <div><span className="text-slate-500">참고 매뉴얼:</span> <span className="text-slate-400">📚 {activeTicketForResolution.referencedManual}</span></div>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">조치 내용 (필수)</label>
                <textarea
                  value={resolutionComment}
                  onChange={(e) => setResolutionComment(e.target.value)}
                  placeholder="예시:&#10;- 사용자 계정 권한을 재동기화하고 재로그인을 안내함&#10;- VPN 클라이언트 설정 초기화 후 접속 정상 확인&#10;- 프린터 스풀러 서비스 재시작 후 테스트 출력 완료"
                  className="w-full h-28 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1">처리자 (선택)</label>
                <select
                  value={resolverNameInput}
                  onChange={(e) => setResolverNameInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="IT 담당자 A">IT 담당자 A (사내 지원 파트)</option>
                  <option value="IT 담당자 B">IT 담당자 B (네트워크/보안 파트)</option>
                  <option value="인프라 운영 담당">인프라 운영 담당자 (시스템 파트)</option>
                  <option value="외부 전문 엔지니어">외부 아웃소싱 엔지니어</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setActiveTicketForResolution(null)}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-855 text-slate-400 text-[11px] font-semibold transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-colors shadow shadow-indigo-600/10"
                >
                  조치 등록 및 완료 처리 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 장애 티켓 상세 조회 모달 (공용 및 일반 사용자 조회 전용) */}
      {activeTicketForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity overflow-y-auto animate-fadeIn">
          <div className="glass-panel rounded-2xl max-w-xl w-full flex flex-col shadow-2xl border border-slate-800 p-5 md:p-6 my-8 animate-scaleUp max-h-[90vh] overflow-y-auto scrollbar-thin">
            
            <div className="flex justify-between items-start mb-4 border-b border-slate-900 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-indigo-400 font-bold text-xs">{activeTicketForDetail.id}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                    activeTicketForDetail.priority === "긴급" 
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}>
                    {activeTicketForDetail.priority}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">장애 티켓 세부 상세 내역</h3>
              </div>
              <button 
                onClick={() => setActiveTicketForDetail(null)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ✕ 닫기
              </button>
            </div>

            {/* 진행 단계 UI (Stepper) */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/40 border border-slate-850 rounded-xl mb-4 text-[10px]">
              <div className="flex flex-col items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-all ${
                  activeTicketForDetail.status === "open" || activeTicketForDetail.status === "processing" || activeTicketForDetail.status === "resolved"
                    ? "bg-blue-500 text-white shadow shadow-blue-500/30"
                    : "bg-slate-800 text-slate-500"
                }`}>
                  1
                </div>
                <span className="text-[9px] font-bold text-slate-300 mt-1">접수</span>
              </div>

              <div className={`h-0.5 flex-1 transition-all ${
                activeTicketForDetail.status === "processing" || activeTicketForDetail.status === "resolved"
                  ? "bg-amber-500"
                  : "bg-slate-800"
              }`}></div>

              <div className="flex flex-col items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-all ${
                  activeTicketForDetail.status === "processing" || activeTicketForDetail.status === "resolved"
                    ? "bg-amber-500 text-white shadow shadow-amber-500/30"
                    : "bg-slate-800 text-slate-500"
                }`}>
                  2
                </div>
                <span className="text-[9px] font-bold text-slate-300 mt-1">처리 중</span>
              </div>

              <div className={`h-0.5 flex-1 transition-all ${
                activeTicketForDetail.status === "resolved"
                  ? "bg-emerald-500"
                  : "bg-slate-800"
              }`}></div>

              <div className="flex flex-col items-center flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold font-mono transition-all ${
                  activeTicketForDetail.status === "resolved"
                    ? "bg-emerald-500 text-white shadow shadow-emerald-500/30"
                    : "bg-slate-800 text-slate-500"
                }`}>
                  3
                </div>
                <span className="text-[9px] font-bold text-slate-300 mt-1">완료</span>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">요청자 (부서)</span>
                  <span className="text-slate-300 font-semibold">{activeTicketForDetail.requesterName} ({activeTicketForDetail.requesterDept})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">접수 일시</span>
                  <span className="text-slate-400 font-mono">{activeTicketForDetail.createdAt}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">오류 유형</span>
                  <span className="text-slate-300 font-semibold">{activeTicketForDetail.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-0.5">완료 일시</span>
                  <span className="text-slate-400 font-mono">
                    {activeTicketForDetail.status === "resolved" ? activeTicketForDetail.resolvedAt : "처리 대기 중"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 block mb-0.5">참고된 지식 매뉴얼</span>
                  <span className="text-slate-300 font-semibold">📚 {activeTicketForDetail.referencedManual}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 block mb-1">장애 문의 제목</span>
                <div className="p-2.5 bg-slate-950 border border-slate-900 rounded-lg text-slate-200 font-semibold">
                  {activeTicketForDetail.title}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 block mb-1">상세 장애 문의 내용</span>
                <div className="p-2.5 bg-slate-950 border border-slate-900 rounded-lg text-slate-450 leading-relaxed max-h-20 overflow-y-auto pr-1">
                  {activeTicketForDetail.description}
                </div>
              </div>

              {/* AI가 제안한 조치 절차 */}
              <div>
                <span className="text-[10px] text-slate-500 block mb-1 font-mono">🤖 등록 시 제안된 AI 조치 절차</span>
                {activeTicketForDetail.aiSuggestedSteps && activeTicketForDetail.aiSuggestedSteps.length > 0 ? (
                  <div className="p-3 bg-indigo-950/15 border border-indigo-900/30 rounded-lg space-y-2 max-h-36 overflow-y-auto pr-1">
                    {activeTicketForDetail.aiSuggestedSteps.map((step, idx) => {
                      const parts = step.split("\n");
                      const cleanTitle = parts[0].replace(/^###\s+/, "").replace(/^\[?단계\s*\d+\]?\s*/i, "").replace(/^\d+[\.\s\-]+\s*/, "").replace(/^[-*•]\s*/, "").trim();
                      return (
                        <div key={idx} className="text-[10.5px] text-slate-350 flex items-start gap-2">
                          <span className="text-indigo-400 font-bold font-mono shrink-0">{idx + 1}.</span>
                          <span className="leading-relaxed">{cleanTitle}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg text-slate-500 italic">
                    등록 시 제안된 AI 조치 절차가 없습니다.
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] text-slate-500 block mb-1">조치 이력 상태 및 세부 내용</span>
                {activeTicketForDetail.status === "resolved" ? (
                  <div className="p-3 bg-emerald-950/10 border border-emerald-500/20 rounded-lg space-y-2">
                    <div className="flex justify-between items-center text-[10px] border-b border-emerald-500/10 pb-1.5">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        조치 완료 처리됨
                      </span>
                      <span className="text-slate-400 font-mono">처리자: {activeTicketForDetail.resolverName}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-[11px]">
                      {activeTicketForDetail.resolutionComment}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg text-slate-500 italic text-center py-4">
                    아직 등록된 조치 내용이 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-900 mt-4">
              <button
                type="button"
                onClick={() => setActiveTicketForDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-6 text-center text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs">
            © 2026 AI 헬프데스크 MVP. IT 직무 이직용 포트폴리오 데모.
          </p>
          <div className="flex gap-4 text-[10.5px]">
            <span className="text-slate-400 font-bold">보안 정책:</span>
            <span>데이터 100% 가명처리</span>
            <span>|</span>
            <span>사내 보안 컴플라이언스 준수</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
