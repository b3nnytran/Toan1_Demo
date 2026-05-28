import OpenAI from "openai";
import fs from "fs";
import path from "path";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = "google/gemini-2.5-flash";

const imageDir = "./images";
const outputPath = "./scripts.json";
const MAX_TOKENS = 3000;

const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? 174);

const LESSON_GROUPS = [
  { lesson: "Các số đến 10", start: 4, end: 30 },
  { lesson: "Phép cộng, phép trừ trong phạm vi 10", start: 32, end: 82 },
  { lesson: "Các số trong phạm vi 100", start: 84, end: 122 },
  { lesson: "Phép cộng, phép trừ trong phạm vi 100", start: 124, end: 170 },
];

function getLesson(page) {
  return LESSON_GROUPS.find(g => page >= g.start && page <= g.end);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanJson(text) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

let output = [];

if (fs.existsSync(outputPath)) {
  try {
    output = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  } catch {
    output = [];
  }
}

for (let i = start; i <= end; i++) {
  const pageName = `page_${String(i).padStart(3, "0")}.jpg`;
  const imagePath = path.join(imageDir, pageName);

  if (!fs.existsSync(imagePath)) {
    console.log(`Missing: ${pageName}`);
    continue;
  }

  if (output.find(item => item.page === i)) {
    console.log(`Skip page ${i}`);
    continue;
  }

  const lessonInfo = getLesson(i);

  const previousPages = output
    .filter(p => p.page < i && p.page >= i - 2)
    .map(
      p => `
Page ${p.page}
Lesson: ${p.lesson || ""}

Line:
${p.line || ""}

Notes:
${p.notes || ""}
`
    )
    .join("\n\n");

  const imageBase64 = fs.readFileSync(imagePath).toString("base64");

  const prompt = `
Bạn là AI giáo viên đang dạy liên tục nhiều slide trong cùng một buổi học.

Thông tin lesson hiện tại:
${lessonInfo?.lesson ?? "Không rõ"}

Ngữ cảnh các trang trước:
${previousPages || "Không có"}

Bây giờ hãy đọc ảnh trang sách mới.

Trả về JSON hợp lệ:

{
  "page": ${i},
  "lesson": "${lessonInfo?.lesson ?? ""}",
  "line": string,
  "notes": string
}

QUY TẮC:
- page luôn là ${i}
- lesson luôn là "${lessonInfo?.lesson ?? ""}"
- line là lời giáo viên đang giảng tự nhiên cho học sinh.
- Nếu cùng lesson với các trang trước, hãy tiếp nối mạch giảng.
- Không lặp lại giới thiệu bài quá nhiều.
- Nếu là bài mới thì mở đầu tự nhiên.
- line khoảng 150–250 từ.
- notes chi tiết hơn line, gồm nội dung bài học, bài tập, đáp án, cách giải, kiến thức trọng tâm, OCR chữ quan trọng.
- Nếu là toán, phải tính đáp án chính xác.
- Không markdown.
- Không giải thích ngoài JSON.
- Không bịa nội dung không thấy rõ.
`;

  let success = false;

  while (!success) {
    try {
      console.log(`Processing page ${i}...`);

      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: MAX_TOKENS,
      });

      const rawText = response.choices[0].message.content;
      const json = JSON.parse(cleanJson(rawText));

      const finalJson = {
        page: i,
        lesson: json.lesson || lessonInfo?.lesson || "",
        line: json.line || "",
        notes: json.notes || "",
      };

      output.push(finalJson);
      output.sort((a, b) => a.page - b.page);

      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

      console.log(`Done page ${i}`);
      success = true;

      await sleep(5000);
    } catch (err) {
      console.log(`Error page ${i}`);
      console.log(err.message || err);

      console.log("Wait 30s then retry...");
      await sleep(30000);
    }
  }
}

console.log("Finished. Saved scripts.json");