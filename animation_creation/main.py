import sys
import os
from pathlib import Path

# Add the learning-path/src to sys.path
root_dir = Path(__file__).resolve().parents[1]
sys.path.append(str(root_dir / "learning-path" / "src"))

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from learning_path.adapters import load_chac_goc_graph
from learning_path.hints import HintLadder

app = FastAPI(title="Aurora Socratic Example")

# Configure CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load curriculum graph and initialize HintLadder
graph_path = root_dir / "knowledge-graph" / "data" / "graph.json"
curriculum = load_chac_goc_graph(graph_path)
ladder = HintLadder(curriculum)

class HintRequest(BaseModel):
    topic_id: str
    press_count: int
    chosen_misconception: str | None = None

@app.post("/api/hint")
def get_hint(req: HintRequest):
    # Retrieve the hint based on the level requested (press_count)
    hint = ladder.request_hint(
        req.topic_id,
        press_count=req.press_count,
        chosen_misconception=req.chosen_misconception
    )
    # The Hint model is a Pydantic model so we can return its dump
    return hint.model_dump(mode="json")

# Mount the static frontend
public_dir = Path(__file__).parent / "public"
app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8089
    uvicorn.run(app, host="127.0.0.1", port=8089)
