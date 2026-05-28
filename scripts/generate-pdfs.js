const fs = require("fs");
const path = require("path");
const https = require("https");
const PDFDocument = require("pdfkit");

const manualsDir = path.join(__dirname, "../src/data/manuals");
// jsDelivr CDN을 사용하여 redirect 없이 실제 TTF 바이너리를 직접 다운로드 (@main 브랜치 명시)
const fontUrl = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf";
const fontPath = path.join(manualsDir, "font.ttf");

// 로컬 윈도우 한글 폰트 경로 (다운로드 실패 또는 기타 에러 대비 Fallback)
const winFontPath = "C:\\Windows\\Fonts\\malgun.ttf";

function cleanMarkdownForPdf(mdContent) {
  const frontMatterRegex = /^---\r?\n([\s\S]+?)\r?\n---/;
  const match = mdContent.match(frontMatterRegex);
  
  let headerText = "";
  let bodyText = mdContent;

  if (match) {
    const yamlBlock = match[1];
    bodyText = mdContent.replace(frontMatterRegex, "").trim();
    
    const metadata = {};
    yamlBlock.split("\n").forEach((line) => {
      const parts = line.split(":");
      if (parts.length >= 2) {
        metadata[parts[0].trim()] = parts.slice(1).join(":").trim().replace(/['"]/g, "");
      }
    });

    headerText = `[AI 헬프데스크 참조 매뉴얼]\n`;
    headerText += `문서 ID: ${metadata.id || "N/A"}\n`;
    headerText += `분류 카테고리: ${metadata.category || "N/A"}\n`;
    headerText += `검색 키워드: ${metadata.keywords || "N/A"}\n`;
    headerText += `최종 수정일: ${metadata.last_updated || "N/A"}\n`;
    headerText += `작성자: ${metadata.author || "N/A"}\n`;
    headerText += `==========================================\n\n`;
  }

  return headerText + bodyText;
}

// 리디렉션을 지원하는 안전한 다운로드 함수
function downloadFont(url, dest) {
  return new Promise((resolve, reject) => {
    // 이전 잘못 캐시된 폰트 파일 제거
    if (fs.existsSync(dest)) {
      fs.unlinkSync(dest);
    }
    
    console.log(`Downloading font from: ${url}`);
    const request = https.get(url, (response) => {
      // 301, 302 리디렉션 처리
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Redirected to: ${response.headers.location}`);
        return downloadFont(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to get font, status code: ${response.statusCode}`));
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        console.log("Font download complete.");
        resolve();
      });
    });
    
    request.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function createPdfFromMarkdown(mdFilePath, fontFile) {
  const fileContent = fs.readFileSync(mdFilePath, "utf8");
  const pdfFileName = path.basename(mdFilePath, ".md") + ".pdf";
  const pdfFilePath = path.join(manualsDir, pdfFileName);
  
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(pdfFilePath);
  doc.pipe(stream);

  doc.font(fontFile);

  const cleanText = cleanMarkdownForPdf(fileContent);

  doc.fontSize(11).lineGap(4).text(cleanText);
  doc.end();

  console.log(`Successfully compiled: ${pdfFileName}`);
}

async function main() {
  let fontToUse = fontPath;
  let downloaded = false;

  try {
    if (!fs.existsSync(manualsDir)) {
      fs.mkdirSync(manualsDir, { recursive: true });
    }

    try {
      await downloadFont(fontUrl, fontPath);
      downloaded = true;
    } catch (downloadErr) {
      console.warn("Failed to download font. Attempting Windows Local Malgun Gothic fallback...", downloadErr.message);
      if (fs.existsSync(winFontPath)) {
        fontToUse = winFontPath;
        console.log("Using Windows system font: Malgun Gothic");
      } else {
        throw new Error("No Korean fonts available (download failed and no local fallback).");
      }
    }

    const files = fs.readdirSync(manualsDir);
    const mdFiles = files.filter(f => f.endsWith(".md"));

    if (mdFiles.length === 0) {
      console.log("No markdown files found to convert.");
      return;
    }

    mdFiles.forEach(mdFile => {
      const mdFilePath = path.join(manualsDir, mdFile);
      createPdfFromMarkdown(mdFilePath, fontToUse);
    });

    // 다운로드한 폰트 정리
    if (downloaded && fs.existsSync(fontPath)) {
      fs.unlinkSync(fontPath);
      console.log("Cleaned up temporary font file.");
    }
    console.log("All manual PDFs created successfully.");

  } catch (error) {
    console.error("Error creating PDFs:", error);
  }
}

main();
