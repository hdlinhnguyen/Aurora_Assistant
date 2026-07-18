import { NextResponse } from "next/server";

function isUUID(str: string): boolean {
  if (!str) return false;
  return /^[0-9a-fA-F]{8}[- ]?[0-9a-fA-F]{4}[- ]?[0-9a-fA-F]{4}[- ]?[0-9a-fA-F]{4}[- ]?[0-9a-fA-F]{12}$/.test(str.trim());
}

function cleanTopicTitle(id: string, name?: string): string {
  if (name && !isUUID(name)) return name.trim();
  if (!id) return "bài học này";
  if (isUUID(id)) return "bài học này";

  const lower = id.toLowerCase();
  if (lower.includes("quy-hoach") || lower.includes("tuyen-tinh")) return "Quy hoạch tuyến tính";
  if (lower.includes("newton")) return "Nhị thức Newton";
  if (lower.includes("dao-ham")) return "Đạo hàm & Ý nghĩa";
  if (lower.includes("phan-tram") || lower.includes("ti-so")) return "Tỉ số & Tỉ số phần trăm";
  if (lower.includes("phan-so")) return "Khái niệm Phân số";
  if (lower.includes("logarit")) return "Phép tính Lôgarit";
  if (lower.includes("to-hop") || lower.includes("dai-so-to-hop")) return "Đại số tổ hợp";
  if (lower.includes("tap-hop")) return "Tập hợp số";
  if (lower.includes("can-thuc")) return "Căn thức bậc hai";
  if (lower.includes("cap-so")) return "Cấp số cộng & Cấp số nhân";

  return id
    .replace(/^demo-/, "")
    .replace(/^l\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function callLLMForSocraticHint(
  topicName: string,
  questionText: string,
  level: number,
  chosenMisconception?: string | null
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Bạn là trợ lý AI Socratic hướng dẫn học sinh tiểu học/trung học học toán.
Chủ đề bài học: "${topicName}"
Câu hỏi bài tập: "${questionText || "Tìm hiểu bản chất bài học"}"
${chosenMisconception ? `Lỗi sai của học sinh: "${chosenMisconception}"` : ""}
Yêu cầu: Sinh 1 câu gợi ý Socratic ngắn gọn (dưới 35 từ), thân thiện, ở Bậc ${level}:
- Bậc 1: Đặt câu hỏi gợi mở, không cho đáp án.
- Bậc 2: Nêu nguyên lý nền tảng / công thức gốc.
- Bậc 3: Hướng dẫn bước thực hiện cụ thể.
Trả về duy nhất nội dung gợi ý, không kèm lời dẫn.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const aiText = data.choices?.[0]?.message?.content?.trim();
      if (aiText) return aiText;
    }
  } catch {
    /* fallback to local dynamic engine below */
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "hint";
    const topic_id = body.topic_id || body.topicId || "l4-khai-niem-phan-so";
    const topic_name = cleanTopicTitle(topic_id, body.topic_name || body.topicName);
    const question_text = body.question_text || body.questionText || "";
    const press_count = Number(body.press_count || body.pressCount || 1);
    const chosen_misconception = body.chosen_misconception || null;

    if (action === "remediation") {
      try {
        const pyRes = await fetch("http://127.0.0.1:8089/api/hint/remediation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic_id, topic_name, question_text }),
        });
        if (pyRes.ok) return NextResponse.json(await pyRes.json());
      } catch {}
      return NextResponse.json({
        has_parent: false,
        original_topic_id: topic_id,
        original_topic_name: topic_name,
        parent_topic_id: topic_id,
        parent_topic_name: topic_name,
        reason: "Nút gốc Cây tri thức."
      });
    }

    if (action === "bridge") {
      try {
        const pyRes = await fetch("http://127.0.0.1:8089/api/hint/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_topic_name: body.original_topic_name || topic_name,
            original_question_text: body.original_question_text || question_text,
            remedial_topic_name: body.remedial_topic_name || "Kiến thức nền",
          }),
        });
        if (pyRes.ok) return NextResponse.json(await pyRes.json());
      } catch {}
      return NextResponse.json({
        original_topic_name: body.original_topic_name || topic_name,
        remedial_topic_name: body.remedial_topic_name || "Kiến thức nền",
        bridge_text: `Em đã làm chủ '${body.remedial_topic_name || "Kiến thức nền"}'! Bây giờ hãy áp dụng nguyên lý này để quay lại giải bài toán gốc '${body.original_topic_name || topic_name}' nhé!`,
        source: "Socratic Bridge Engine"
      });
    }

    // 1. Thử gọi Python Animation Microservice (port 8089)
    try {
      const pyRes = await fetch("http://127.0.0.1:8089/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_id,
          topic_name,
          question_text,
          press_count,
          chosen_misconception,
        }),
      });

      if (pyRes.ok) {
        const pyData = await pyRes.json();
        return NextResponse.json({
          ...pyData,
          topic_name,
        });
      }
    } catch {
      /* Python server offline */
    }

    // 2. Thử gọi trực tiếp LLM API (OpenAI/Gemini) nếu có API Key
    const llmHint = await callLLMForSocraticHint(topic_name, question_text, press_count, chosen_misconception);
    if (llmHint) {
      return NextResponse.json({
        topic_id,
        topic_name,
        level: Math.min(press_count, 3),
        text: llmHint,
        source: "LLM (Real-time AI)",
        exhausted: press_count > 3,
        escalation: null,
      });
    }

    // 3. Dự phòng động theo ngữ cảnh bài học (Dynamic Topic-Aware Socratic Engine)
    const level = Math.min(press_count, 3);
    let text = "";
    const nameLower = topic_name.toLowerCase();

    if (level === 1) {
      if (chosen_misconception) {
        text = `Em vừa chọn phương án theo hướng "${chosen_misconception}". Thử suy ngẫm: Với kiến thức "${topic_name}", bước biến đổi đó có đúng bản chất không? Điều kiện nào cần thỏa mãn đầu tiên?`;
      } else if (nameLower.includes("tam thức") || nameLower.includes("bậc hai")) {
        text = `Trước khi giải bài "${topic_name}", em tự hỏi: Bước đầu tiên là tính biệt thức $\\Delta = b^2 - 4ac$ để xác định số nghiệm và dấu của tam thức $f(x) = ax^2 + bx + c$?`;
      } else if (nameLower.includes("tài chính") || nameLower.includes("lãi suất") || nameLower.includes("vay nợ")) {
        text = `Trước khi giải bài "${topic_name}", em tự hỏi: Bài toán đang tính theo mô hình Lãi đơn hay Lãi kép $T_n = A(1 + r)^n$?`;
      } else if (nameLower.includes("tỉ số") || nameLower.includes("phần trăm")) {
        text = `Trước khi giải bài "${topic_name}", em tự hỏi: Để tìm tỉ số phần trăm của a và b, đại lượng nào là tổng thể, đại lượng nào là thành phần cần so sánh?`;
      } else if (nameLower.includes("quy hoạch") || nameLower.includes("tuyến tính")) {
        text = `Trước khi làm tiếp bài "${topic_name}", em tự hỏi: Bước đầu tiên là cần vẽ miền nghiệm của từng bất phương trình hay tìm hàm mục tiêu F(x, y)?`;
      } else if (nameLower.includes("newton")) {
        text = `Với bài "${topic_name}", hãy nhớ lại: Số hạng tổng quát Tₖ₊₁ trong khai triển (a+b)ⁿ được xác định bởi công thức tổ hợp Cₙᵏ nào?`;
      } else {
        text = `Trước khi làm tiếp bài "${topic_name}", em tự hỏi: bước đầu tiên cần xác định điều kiện xác định hay dạng tổng quát nào?`;
      }
    } else if (level === 2) {
      if (nameLower.includes("tam thức") || nameLower.includes("bậc hai")) {
        text = `Nhớ lại nguyên lý của "${topic_name}": Định lý về dấu của tam thức bậc hai $f(x) = ax^2 + bx + c$: Nếu $\\Delta < 0$, $f(x)$ luôn cùng dấu với hệ số a với mọi x!`;
      } else if (nameLower.includes("tài chính") || nameLower.includes("lãi suất") || nameLower.includes("vay nợ")) {
        text = `Nhớ lại nguyên lý của "${topic_name}": Công thức Lãi kép là $T_n = A(1 + r)^n$, trong đó A là vốn ban đầu, r là lãi suất mỗi kỳ, n là số kỳ gửi/vay!`;
      } else if (nameLower.includes("tỉ số") || nameLower.includes("phần trăm")) {
        text = `Nhớ lại nguyên lý của "${topic_name}": Muốn tìm tỉ số phần trăm của a và b, ta tính tích (a ÷ b) × 100%. Áp dụng nguyên lý này vào câu hỏi để suy ra bước tính tiếp theo!`;
      } else if (nameLower.includes("quy hoạch") || nameLower.includes("tuyến tính")) {
        text = `Từ nguyên lý của "${topic_name}": Giá trị lớn nhất hoặc nhỏ nhất của hàm mục tiêu F(x, y) = ax + by luôn đạt tại một trong các đỉnh của đa giác miền nghiệm!`;
      } else {
        text = `Nhớ lại nguyên lý nền tảng của bài "${topic_name}": Xác định miền xác định, công thức gốc và các tính chất cơ bản. Từ nguyên lý đó, em suy ra bước làm tiếp theo xem!`;
      }
    } else {
      if (nameLower.includes("tài chính") || nameLower.includes("lãi suất") || nameLower.includes("vay nợ")) {
        text = `Hướng dẫn chi tiết bài "${topic_name}": Xác định Vốn gốc A, Lãi suất r (đổi ra thập phân), Số kỳ n, rồi thay vào công thức $T = A(1+r)^n$ để bấm máy tính!`;
      } else if (nameLower.includes("tỉ số") || nameLower.includes("phần trăm")) {
        text = `Hướng dẫn chi tiết bài "${topic_name}": Lấy số lượng phần cần so sánh chia cho tổng số phần, sau đó nhân 100 và thêm ký hiệu %. Thử bấm lại phép tính này xem!`;
      } else {
        text = `Làm thử ví dụ nhỏ nhất của bài "${topic_name}" rồi áp dụng y hệt các bước đó vào bài đang làm. Gợi ý cụ thể: Đưa biểu thức về dạng tiêu chuẩn đơn giản nhất.`;
      }
    }

    return NextResponse.json({
      topic_id,
      topic_name,
      level,
      text,
      source: "Socratic Engine",
      exhausted: press_count > 3,
      escalation:
        press_count > 3
          ? {
              recommended_topic_ids: [topic_id],
              reason: `Dùng quá 3 gợi ý ở bài "${topic_name}" — đề xuất ôn lại kiến thức nền`,
            }
          : null,
    });
  } catch {
    return NextResponse.json({
      topic_id: "demo",
      topic_name: "Bài học",
      level: 1,
      text: "Trước khi làm tiếp, em tự hỏi: bước đầu tiên cần kiểm tra điều gì?",
      exhausted: false,
      escalation: null,
    });
  }
}
