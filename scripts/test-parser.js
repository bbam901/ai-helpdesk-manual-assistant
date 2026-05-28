const fs = require("fs");
const path = require("path");

// 1. 테스트용 대상 정규화 함수
function normalizePdfText(text) {
  let processed = text;
  // 단어 중간의 하이픈 + 줄바꿈 복원 (예: Wi-\nFi -> Wi-Fi)
  processed = processed.replace(/(\w+)-\s*\n\s*(\w+)/g, "$1-$2");
  // 장식용 구분선 라인 제거 (예: ---, ===, * * *)
  processed = processed.replace(/^[-=]{3,}\s*$/gm, "");
  processed = processed.replace(/^\*\s+\*\s+\*\s*$/gm, "");
  // 페이지 번호 또는 단독 숫자 줄 제거 (예: 공백 포함한 단독 숫자)
  processed = processed.replace(/^\s*\d+\s*$/gm, "");
  // 연속 줄바꿈 축소 및 양끝 트림
  processed = processed.replace(/\r\n/g, "\n");
  processed = processed.replace(/\n{3,}/g, "\n\n");
  return processed;
}

// 2. 테스트용 조치 절차 파서
function extractSuggestedSteps(content) {
  const steps = [];
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  let isInStepsSection = false;
  let rawStepsBuffer = [];

  for (const line of lines) {
    if (line.match(/^##\s+\d+\.\s+(단계별\s+)?해결\s+절차/) || line.match(/^##\s+\d+\.\s+조치\s+절차/)) {
      isInStepsSection = true;
      continue;
    }
    if (isInStepsSection && line.startsWith("## ") && !line.startsWith("###")) {
      break;
    }
    if (isInStepsSection) {
      if (line.match(/^[-=]{3,}/) || line === "---" || line === "===") continue;
      if (line.includes("관련 부서") || line.includes("문의처") || line.includes("검색 키워드")) continue;
      rawStepsBuffer.push(line);
    }
  }

  if (rawStepsBuffer.length > 0) {
    let currentStep = "";
    for (const line of rawStepsBuffer) {
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

  return steps;
}

console.log("==========================================");
console.log("🧪 Running RAG PDF Parsing Unit Tests...");
console.log("==========================================");

let failed = false;

// Test 1: "Wi-\nFi" 복원 검증
try {
  const input = "사내 Wi-\nFi 연결 상태를 확인하십시오.";
  const output = normalizePdfText(input);
  console.log(`[Test 1] 'Wi-\\nFi' 복원 결과: "${output}"`);
  if (output.includes("Wi-Fi") && !output.includes("Wi-\nFi")) {
    console.log("✅ [Test 1] 'Wi-\\nFi' -> 'Wi-Fi' 복원 성공!");
  } else {
    throw new Error("'Wi-Fi' 단어가 정상적으로 연결되지 못했습니다.");
  }
} catch (e) {
  console.error("❌ [Test 1] 실패:", e.message);
  failed = true;
}

// Test 2: "---" 구분선 필터링 검증
try {
  const input = `
## 3. 조치 절차
---
### [단계 1] 프린터 제어판 실행
---
  `;
  const outputSteps = extractSuggestedSteps(input);
  console.log(`[Test 2] 구분선 제외 결과:`, outputSteps);
  const hasDivider = outputSteps.some(s => s.includes("---"));
  if (!hasDivider && outputSteps.length > 0) {
    console.log("✅ [Test 2] '---' 구분선 차단 성공!");
  } else {
    throw new Error("조치 절차 목록에 구분선이 포함되어 있습니다.");
  }
} catch (e) {
  console.error("❌ [Test 2] 실패:", e.message);
  failed = true;
}

// Test 3: 단독 숫자 줄 제거 검증
try {
  const input = "첫 번째 행\n\n   125   \n\n두 번째 행";
  const output = normalizePdfText(input);
  console.log(`[Test 3] 단독 숫자 제거 결과: "${output}"`);
  if (!output.includes("125")) {
    console.log("✅ [Test 3] 단독 숫자 페이지 라인 제거 성공!");
  } else {
    throw new Error("단독 숫자 줄이 제거되지 않았습니다.");
  }
} catch (e) {
  console.error("❌ [Test 3] 실패:", e.message);
  failed = true;
}

// Test 4: 조치 절차가 잘리지 않고 통문장으로 이어지는지 검증
try {
  const input = `
## 3. 조치 절차
### [단계 1] 사서함 정리
사용자의 Outlook 이메일 사서함 보관
폴더 용량을 직접 정리하거나
서버 정리 규칙을 활성화합니다.
  `;
  const outputSteps = extractSuggestedSteps(input);
  console.log(`[Test 4] 파싱된 조치 단계:`, outputSteps);
  if (outputSteps.length === 1 && outputSteps[0].includes("서버 정리 규칙을 활성화합니다.")) {
    console.log("✅ [Test 4] 문장 중간 잘림 없이 정상 결합 성공!");
  } else {
    throw new Error("문장 중간 줄바꿈으로 인해 조치 절차가 쪼개졌거나 유실되었습니다.");
  }
} catch (e) {
  console.error("❌ [Test 4] 실패:", e.message);
  failed = true;
}

console.log("==========================================");
if (failed) {
  console.error("❌ Some tests failed! Check implementation.");
  process.exit(1);
} else {
  console.log("🎉 All 4 RAG Parser Unit Tests Passed Successfully!");
  process.exit(0);
}
