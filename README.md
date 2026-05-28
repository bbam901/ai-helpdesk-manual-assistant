# 🛠️ ITSM AI Helpdesk (사내 매뉴얼 기반 RAG 장애 조치 시스템 MVP)

> **"사내 중요 데이터가 외부 LLM에 유출되면 어쩌지?"** 라는 고민에서 출발한 토이 프로젝트입니다.  
> 보안 규정 때문에 외부 클라우드 LLM API를 함부로 쓸 수 없는 상황을 가정하고, 사내에 저장된 PDF 매뉴얼을 활용해 장애 발생 시 즉시 조치 방법을 가이드해주는 **AI 헬프데스크 대시보드**를 구현했습니다.

---

## 💡 개발 배경 (이 프로젝트를 왜 만들었을까요?)

1. **사내 데이터 보안 문제**  
   임직원의 개인정보, 내부망 IP 주소, 사내 도메인 등이 외부 LLM(GPT, Claude 등)의 학습 데이터로 사용되거나 유출될 위험이 존재합니다. 이를 방지하기 위한 안전한 검색 모델이 필요했습니다.
2. **현업 사용자와 엔지니어 간의 소통 격차**  
   현업 직원들은 오류 코드 대신 `"결재 창이 안 떠요"`, `"로그인이 안 돼요"` 같이 일상적인 구어체로 문의하는 경우가 많아, 기존의 키워드 매칭 방식으로는 필요한 매뉴얼을 찾기 어려웠습니다.
3. **장애 조치 시간(MTTR) 단축**  
   수십~수백 페이지에 달하는 PDF 매뉴얼을 직접 다 뒤질 필요 없이, 자연어로 질문을 던지면 필요한 부분만 골라 핵심 조치 단계(Action Plan)와 매칭 근거 문장을 바로 대시보드에 띄워 복구 속도를 줄이고자 했습니다.

---

## 🖥️ 주요 기능

* **ITSM 3단 업무 대시보드 UI**
  * **좌측**: 등록된 PDF 매뉴얼 카테고리 현황 및 등록된 지식 파일 목록
  * **중앙**: 자연어 질문 진단 콘솔, 자주 발생하는 장애 프리셋 버튼, AI 조치 가이드(원인 분석, 조치 단계 제공)
  * **우측**: 검색 점수(Score) 기반의 참고 문서 정보, 해시태그, **실제 PDF 속 참조 문장(스니펫)** 키워드 하이라이팅
* **보안 가명화 검색 엔진 (Anonymized RAG)**
  * 사내 기밀 정보가 외부로 노출되지 않도록 가상 IP 대역(`10.x.x.x`), 마스킹 처리된 이메일, 직무 역할명(`담당자 A`) 등으로 가명화 처리를 모사했습니다.
* **단락 기반 가중치 매칭 & 동적 쿼리 확장**
  * 단순히 전체 파일 매칭이 아닌, 단락(Chunk) 단위로 가중치를 채점합니다 (제목 일치, 키워드 포함 여부 등).
  * 유사어 사전(Synonym Dictionary)을 설계하여 `"로그인 안됨" - "접속 불가" - "인증 실패"`처럼 서로 다른 단어로 검색해도 유연하게 매칭되도록 쿼리를 자동 확장합니다.
* **신뢰성 컷오프 (Threshold Fallback)**
  * 매칭 점수가 기준치(15점) 미만인 경우, 어설픈 답변(환각)을 내기보단 *"관련 매뉴얼을 찾을 수 없습니다"* 문구와 함께 헬프데스크 공식 연락처를 띄워 실수를 예방합니다.
* **역할 기반 로그인 및 접근 제어 (Mock Auth)**
  * **일반 사용자 (`user/user123`)**: 본인이 작성한 장애 문의 목록 확인, 진행 단계(접수 ➡️ 처리중 ➡️ 완료) Stepper 모달 확인 (조회 전용).
  * **IT 관리자 (`admin/admin123`)**: 전체 장애 문의 처리, 티켓 상태 제어, 조치 내역 입력(완료 처리 시 필수 기재), 사용자별 반복 장애 통계 대시보드(User Diagnostics) 제공.
* **PDF 매뉴얼 실시간 업로드 및 파싱**
  * 관리자가 새로운 PDF 매뉴얼을 업로드하면 백엔드에서 텍스트를 파싱하여 PostgreSQL 데이터베이스에 저장하고, 즉시 RAG 지식베이스에 반영합니다.

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4
* **Database / ORM**: PostgreSQL, Prisma ORM
* **Libraries**: `pdf-parse` (PDF 텍스트 추출), `@napi-rs/canvas` (PDF 파싱 캔버스 폴리필), `pdfkit` (테스트용 가상 PDF 자동 생성)
* **DevOps**: Docker, Docker Compose

---

## 🏃‍♂️ 실행 방법 (How to Run)

### A. Docker Compose로 실행하기 (추천)
이 프로젝트는 데이터베이스(PostgreSQL)와 Next.js 웹 서버가 함께 구동되도록 도커 컴포즈 설정이 완료되어 있습니다.

1. **컨테이너 빌드 및 실행**
   ```bash
   docker compose up --build -d
   ```
   > 💡 **Tip**: 빌드 과정 중 `scripts/generate-pdfs.js` 스크립트가 실행되어, 테스트용 가상 보안 가명화 PDF 문서 20종을 자동으로 생성하고 적재합니다.
2. **서비스 확인 및 DB 접속**
   * 웹 애플리케이션: 브라우저에서 `http://localhost:3001`로 접속합니다.
   * 로컬 데이터베이스: `localhost:5433` (ID: `helpdesk`, PW: `helpdesk`, DB: `helpdesk`)
3. **컨테이너 상태 확인**
   ```bash
   docker ps
   # docker-compose.yml에 명세된 healthcheck 조건에 따라 STATUS 열에 (healthy)가 표시되는지 확인합니다.
   ```
4. **서비스 중지**
   ```bash
   docker compose down
   ```

### B. 로컬 Node.js 환경에서 직접 실행하기
1. **의존성 패키지 설치**
   ```bash
   npm install
   ```
2. **테스트용 PDF 매뉴얼 생성**
   ```bash
   node scripts/generate-pdfs.js
   ```
3. **개발 서버 구동**
   ```bash
   npm run dev
   ```
   * 브라우저에서 `http://localhost:3000`으로 접속하여 결과를 확인할 수 있습니다.
   * *참고: 로컬 DB 환경 설정이 번거로우실 경우를 대비해, 초기 구동 시 데이터베이스가 감지되지 않으면 브라우저 `localStorage`를 통해 데모 데이터를 복원하여 전체적인 비즈니스 흐름을 테스트해볼 수 있도록 예외 처리를 마련해두었습니다.*

---

## 🔥 고민과 해결 (Troubleshooting & Learnings)

프로젝트를 밑바닥부터 구현하고 최적화하면서 마주쳤던 기술적 문제들과 디버깅 기록들입니다.

### 1. Next.js App Router (ESM) 환경에서 CommonJS 라이브러리(`pdf-parse`) 호환성 이슈
* **문제 상황**: Next.js App Router는 기본적으로 ESM 방식을 권장하지만, PDF 파싱을 위해 사용하려던 `pdf-parse` 모듈은 다소 옛날 모듈이라 CommonJS(CJS) 형태로 되어 있었습니다. 일반적인 `import pdfParse from 'pdf-parse'` 형식으로 사용 시 `"pdf-parse is not a function"` 에러를 뿜으며 빌드가 되지 않는 현상이 발생했습니다.
* **해결 방법**: ESM 환경 내에서도 CommonJS 모듈을 온전히 로드할 수 있도록 Node.js의 네이티브 ESM-CJS 브릿지 헬퍼인 `module.createRequire`를 도입했습니다.
  ```typescript
  import { createRequire } from 'module';
  const require = createRequire(import.meta.url);
  const pdfParse = require('pdf-parse');
  ```
  덕분에 컴파일 충돌 없이 서버 컴포넌트 내부에서 안정적으로 PDF 파싱 라이브러리를 불러와 구동시킬 수 있었습니다.

### 2. Node.js 백엔드(도커) 환경에서 Canvas 레퍼런스 누락 에러 (`DOMMatrix is not defined`)
* **문제 상황**: `pdf-parse` 엔진이 PDF의 드로잉 레이아웃 및 텍스트 래퍼를 파싱하는 과정 중 브라우저 전용 캔버스 전역 클래스(`DOMMatrix`, `ImageData`, `Path2D`)를 내부적으로 참조하려고 시도했습니다. 하지만 도커 컨테이너나 Node.js 백엔드 런타임에는 브라우저 엔진이 존재하지 않기 때문에 `ReferenceError`가 발생하며 서버가 비정상 종료되었습니다.
* **해결 방법**: Node.js 환경에서 브라우저의 캔버스 동작을 흉내 낼 수 있는 `@napi-rs/canvas` 폴리필(Polyfill) 모듈을 프로젝트에 도입했습니다. 파서 유틸리티의 가장 윗부분에 직접 글로벌 객체 매핑 코드를 주입하여 백엔드 런타임에서도 정상적으로 동작하도록 해결했습니다.
  ```typescript
  import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = DOMMatrix as any;
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = ImageData as any;
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = Path2D as any;
  }
  ```
  이 조치로 백엔드 파이프라인에서 에러 없이 PDF 텍스트 추출 성공률을 확보했습니다.

### 3. Docker 볼륨 연동을 통한 데이터 영속성 유지
* **문제 상황**: 도커 컨테이너 특성상 컨테이너를 재빌드하거나 삭제하면 관리자가 직접 업로드했던 PDF 파일들과 파싱 후 데이터베이스에 누적된 데이터가 모두 날아가 버리는 심각한 휘발성 문제가 있었습니다.
* **해결 방법**: 컨테이너의 라이프사이클과 데이터 수명을 독립적으로 격리하기 위해 Docker Named Volume을 활용했습니다.
  - 업로드된 PDF 원본을 저장할 `ai_helpdesk_manual_uploads` 볼륨
  - PostgreSQL의 내부 데이터 저장소에 바인딩할 `ai_helpdesk_postgres_data` 볼륨
  
  이를 `docker-compose.yml` 볼륨 명세에 추가하여 컨테이너 파괴 및 재생성 뒤에도 기존 데이터가 안전하게 유지되도록 환경을 정비했습니다.

---

## 🔮 향후 개선 계획 (Roadmap)

공부하면서 아쉬웠거나 앞으로 추가해보고 싶은 기능들의 기록입니다.

* **Vector Embedding & Vector DB 고도화**  
  현재는 단어 출현 빈도와 제목 매칭 점수 기반으로 가중치를 두고 검색하고 있습니다. 이를 개선하여 OpenAI `text-embedding-3-small` 또는 로컬 임베딩 모델을 활용하고, Chroma DB나 Pinecone 같은 벡터 DB에 단락을 적재하여 의미(Semantic) 중심의 더 고도화된 RAG 검색을 해보고 싶습니다.
* **Ollama (Local LLM) 연동을 통한 완전 온프레미스화**  
  사내 데이터 보호가 메인 주제인 만큼, 외부 클라우드 API를 전혀 타지 않는 구조를 만들고 싶습니다. 로컬 서버에 Llama 3나 Gemma 2 등의 가벼운 모델을 올라마(Ollama)로 띄워 연동하는 온프레미스 AI 헬프데스크를 기획 중입니다.
* **실무 ITSM 시스템 연동 (Jira API)**  
  대시보드 상에서 사용자가 AI 조치 결과를 시도한 뒤 "미해결" 피드백 버튼을 누르는 경우, 사내에서 사용 중인 Jira(지라) API를 자동으로 호출하여 실무 담당자에게 자동으로 장애 티켓을 헬프데스크로 이관하는 연동 기능을 덧붙이고 싶습니다.
