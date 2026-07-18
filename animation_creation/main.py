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

import subprocess
import random

SCENES = [
    "TexTransformExample",
    "AnimatingMethods",
    "CoordinateSystemExample",
    "GraphExample",
    "OpeningManimExample"
]

@app.post("/api/hint")
def get_hint(req: HintRequest):
    # Retrieve the hint based on the level requested (press_count)
    hint = ladder.request_hint(
        req.topic_id,
        press_count=req.press_count,
        chosen_misconception=req.chosen_misconception
    )
    # The Hint model is a Pydantic model so we can return its dump
    hint_dict = hint.model_dump(mode="json")
    
    # Generate visualization if level >= 2
    if hint.level >= 2:
        scene_name = random.choice(SCENES)
        media_dir = public_dir / "media"
        video_rel_path = f"media/videos/example_scenes/480p15/{scene_name}.mp4"
        video_abs_path = public_dir / "media" / "videos" / "example_scenes" / "480p15" / f"{scene_name}.mp4"
        
        if not video_abs_path.exists():
            cmd = [
                "manim", "-ql", 
                str(Path(__file__).parent / "example_scenes.py"), 
                scene_name,
                "--media_dir", str(media_dir),
                "-o", f"{scene_name}.mp4"
            ]
            print(f"Generating Manim video for {scene_name}...")
            try:
                subprocess.run(cmd, capture_output=True, check=True)
                hint_dict["video_url"] = f"/{video_rel_path}"
                hint_dict["scene_name"] = scene_name
            except Exception as e:
                print(f"Manim generation failed (maybe manim is not installed correctly): {e}")
                # Fallback to no video if generation fails
                pass
        else:
            hint_dict["video_url"] = f"/{video_rel_path}"
            hint_dict["scene_name"] = scene_name
        
    return hint_dict

# Mount the static frontend
public_dir = Path(__file__).parent / "public"
app.mount("/", StaticFiles(directory=str(public_dir), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8089
    uvicorn.run(app, host="127.0.0.1", port=8089)
