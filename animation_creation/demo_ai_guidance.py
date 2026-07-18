import sys
from pathlib import Path
import json

# Add the learning-path/src to sys.path so we can import the AI service
root_dir = Path(__file__).resolve().parents[1]
sys.path.append(str(root_dir / "learning-path" / "src"))

from learning_path.adapters import load_chac_goc_graph
from learning_path.hints import HintLadder

def main():
    print("=== DEMO: AI SOCRATIC GUIDANCE ANIMATION SCRIPT ===")
    print("Dựa trên kiến trúc Backend và AI Services của Aurora Assistant\n")
    
    # Load knowledge graph
    graph_path = root_dir / "knowledge-graph" / "data" / "graph.json"
    if not graph_path.exists():
        print(f"Error: Could not find graph.json at {graph_path}")
        return
        
    curriculum = load_chac_goc_graph(graph_path)
    ladder = HintLadder(curriculum)
    
    # Giả lập tình huống: Học sinh làm sai bài toán liên quan đến "Giải phương trình bậc nhất"
    # Chọn một topic_id có sẵn trong graph.json. Ta sẽ lấy topic đầu tiên làm ví dụ nếu không biết id cụ thể.
    with open(graph_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    topic_id = data["nodes"][0]["id"]
    topic_name = data["nodes"][0]["ten"]
    
    print(f"[TÌNH HUỐNG]: Học sinh liên tục làm sai hoặc không hiểu về chủ đề '{topic_name}' (ID: {topic_id})\n")
    print("=> HỆ THỐNG AI SẼ SINH RA CÁC CÂU TRẢ LỜI HƯỚNG DẪN THEO 3 CẤP ĐỘ (SOCRATIC -> FIRST-PRINCIPLES -> BOTTOM-OUT):\n")
    
    # Level 1: Socratic Nudge
    print("--- [BẬC 1: Socratic Nudge - Câu hỏi gợi mở] ---")
    hint_1 = ladder.request_hint(topic_id, press_count=1, chosen_misconception="cộng nhầm dấu")
    print(f"AI: {hint_1.text}\n")
    
    # Level 2: First-principles
    print("--- [BẬC 2: First-principles - Gợi nhắc nguyên lý nền tảng] ---")
    hint_2 = ladder.request_hint(topic_id, press_count=2)
    print(f"AI: {hint_2.text}\n")
    
    # Level 3: Bottom-out
    print("--- [BẬC 3: Bottom-out - Hướng dẫn chi tiết bằng ví dụ nhỏ nhất] ---")
    hint_3 = ladder.request_hint(topic_id, press_count=3)
    print(f"AI: {hint_3.text}\n")
    
    # Quá giới hạn (Cần ôn lại)
    print("--- [QUÁ GIỚI HẠN: Chẩn đoán lỗ hổng và đề xuất học lại] ---")
    hint_4 = ladder.request_hint(topic_id, press_count=4)
    print(f"AI: {hint_4.text}")
    print(f"[Hệ thống tự động ghi nhận Escalation]: {hint_4.escalation.reason}\n")

if __name__ == "__main__":
    main()
