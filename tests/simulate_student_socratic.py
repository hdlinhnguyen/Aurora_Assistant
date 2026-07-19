"""Simulation test for Student Socratic Review, Backtracking, and forward LLM bridging."""

import json
import os
import sys
import urllib.parse
import urllib.request

BASE_URL = os.environ.get("AURORA_API_URL", "http://localhost:8082/api").rstrip("/")
PASSWORD = "demo123"
STUDENT_EMAIL = "student@aurora.edu.vn"  # Primary student login
FALLBACK_STUDENT_EMAIL = "synthetic.student.a@aurora.local"

def request(method: str, path: str, *, token: str | None = None, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    url = BASE_URL + path
    # URL escape query params if necessary, but keep path structure
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        print(f"HTTP Error {e.code} on {method} {path}: {body_err}")
        raise e

def login(email: str) -> dict | None:
    try:
        return request("POST", "/auth/login", body={"email": email, "password": PASSWORD})
    except Exception as e:
        print(f"Login failed for {email}: {e}")
        return None

def main():
    print("=== STARTING SOCRATIC PRACTICE STUDENT JOURNEY SIMULATION ===")
    
    # 1. Login
    auth = login(STUDENT_EMAIL)
    if not auth:
        print(f"Trying fallback login with {FALLBACK_STUDENT_EMAIL}...")
        auth = login(FALLBACK_STUDENT_EMAIL)
        if not auth:
            print("ERROR: Authentication failed for both student and synthetic student.")
            sys.exit(1)
            
    token = auth["token"]
    student_id = auth["user"]["id"]
    print(f"Logged in successfully. User: {auth['user']['name']} (ID: {student_id})")

    # 2. Get Subjects and find one with a tree
    subjects = request("GET", "/subjects", token=token)
    print(f"Available subjects: {subjects}")
    
    selected_subject = None
    selected_node = None
    questions = []
    
    for subj in subjects:
        try:
            tree = request("GET", f"/subjects/{urllib.parse.quote(subj)}/tree", token=token)
            nodes = tree.get("nodes", [])
            for node in nodes:
                # Find a node that has questions
                q_list = request("GET", f"/nodes/{node['id']}/questions", token=token)
                if q_list and len(q_list) > 0:
                    selected_subject = subj
                    selected_node = node
                    questions = q_list
                    break
            if selected_node:
                break
        except Exception as e:
            continue

    if not selected_node:
        print("ERROR: Could not find any node with questions to test Socratic flows.")
        sys.exit(1)

    print(f"\nTarget Subject: {selected_subject}")
    print(f"Target Node for Review: {selected_node['name']} (ID: {selected_node['id']})")
    print(f"Loaded {len(questions)} practice questions.")

    # 3. Simulate Struggling Student Flow (Hint, Stuck, Backtrack)
    print("\n--- SIMULATING STRUGGLING STUDENT FLOW ---")
    question = questions[0]
    question_content = question["content"]
    
    # A. Chat with Socratic companion about the question
    print(f"Student: Nova ơi, câu hỏi này làm như thế nào: '{question_content}'")
    chat_res = request("POST", f"/nodes/{selected_node['id']}/chat-theory", token=token, body={
        "message": "Nova ơi, hướng dẫn mình giải câu này với, mình không biết bắt đầu từ đâu.",
        "history": [],
        "questionText": question_content
    })
    print(f"AI Companion (Socratic response): {chat_res['reply']}")
    assert len(chat_res['reply']) > 0, "AI tutor response should not be empty"

    # B. Request hint from student hint API
    print("\nStudent: Clicked 'Xem gợi ý' (Level 1)")
    hint_res_1 = request("POST", "/student/hints", token=token, body={
        "topicId": selected_node['id'],
        "pressCount": 1
    })
    print(f"AI Hint Level 1: {hint_res_1.get('content') or hint_res_1.get('text')}")

    # C. Stuck / Cant Do trigger
    print("\nStudent: Stuck! Clicking 'Gặp khó khăn / Không biết làm'")
    cant_do_res = request("POST", f"/nodes/{selected_node['id']}/cant-do", token=token)
    print(f"Stuck response (Prerequisite parent proposals): {cant_do_res}")
    
    has_easy = cant_do_res.get("hasEasyQ", False)
    parents = cant_do_res.get("parents", [])
    print(f"  - Has easier question option: {has_easy}")
    print(f"  - Found parent nodes (prerequisites): {[p['name'] for p in parents]}")

    # D. Backtracking (adaptive downgrade to prerequisite)
    parent_node_id = None
    parent_node_name = None
    if parents:
        parent_node_id = parents[0]["id"]
        parent_node_name = parents[0]["name"]
        print(f"\nBacktracking to prerequisite parent node: '{parent_node_name}' (ID: {parent_node_id})")
        # Submit adaptive downgrade telemetry
        downgrade_res = request("POST", f"/nodes/{selected_node['id']}/adaptive-downgrade", token=token)
        print(f"Backtracking telemetry response: {downgrade_res}")
    else:
        print("\nNo parent node found for backtracking, using current node for testing forward bridge.")
        parent_node_id = selected_node['id']
        parent_node_name = selected_node['name']

    # 4. Simulate Smart Student Solving Prerequisite and Forward Socratic Bridging
    print("\n--- SIMULATING SUCCESS & FORWARD BRIDGE FLOW ---")
    parent_questions = request("GET", f"/nodes/{parent_node_id}/questions", token=token)
    if not parent_questions:
        print("No questions found on parent node, simulating answer on current node.")
        parent_questions = questions
        parent_node_id = selected_node['id']
        parent_node_name = selected_node['name']

    pq = parent_questions[0]
    print(f"Solving prerequisite question: '{pq['content']}'")
    # Submit correct answer
    ans_res = request("POST", f"/nodes/{parent_node_id}/answer", token=token, body={
        "questionId": pq["id"],
        "selectedOption": pq["correctOption"]
    })
    print(f"Answer response (isCorrect): {ans_res['isCorrect']}")
    assert ans_res['isCorrect'] == True, "Submitted answer should be correct"

    # Now that the prerequisite is solved, generate forward Socratic bridge back to original node
    if parents:
        print(f"\nPrerequisite solved! Generating forward Socratic bridge from '{parent_node_name}' back to '{selected_node['name']}'")
        bridge_message = f"Mình đã làm xong bài ôn tập '{parent_node_name}' rồi, giải thích cho mình bài gốc '{selected_node['name']}' đi!"
        bridge_res = request("POST", f"/nodes/{parent_node_id}/chat-theory", token=token, body={
            "message": bridge_message,
            "history": [
                {"sender": "student", "content": f"Mình muốn lùi về ôn bài nền tảng: {parent_node_name}."},
                {"sender": "ai", "content": f"Đúng rồi! Chúng mình cùng lùi về ôn tập kiến thức nền tảng: {parent_node_name}."}
            ],
            "questionText": f"Hãy tạo cầu nối giải thích từ kiến thức nền tảng '{parent_node_name}' (vừa làm đúng) để giải bài toán gốc khó hơn '{selected_node['name']}' với câu hỏi: '{question_content}'"
        })
        print(f"AI Socratic Bridge response:\n{bridge_res['reply']}")
        assert len(bridge_res['reply']) > 0, "Socratic bridge explanation should be generated"

    print("\n=== JOURNEY SIMULATION SUCCESSFULLY PASSED! ===")

if __name__ == "__main__":
    main()
