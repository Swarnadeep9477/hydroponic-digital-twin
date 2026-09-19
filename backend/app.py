"""
FastAPI backend for the multi-species growth engine.

POST /simulate takes the current grow-bed parameters (plus which species is
planted) and returns the full day-by-day trajectory from the mechanistic
ground-truth simulator (simulator.py) - this is what the frontend animates
the plant through, and what the harvest report is built from.

Run with: uvicorn app:app --reload --port 8000
"""
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import simulator

app = FastAPI(title="Hydroponic Growth Engine")

# local dev/demo only - the frontend is a static page served from file:// or
# a local static server, so we allow any origin rather than pin one down
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Nutrients(BaseModel):
    N: float = Field(ge=0, le=300)
    P: float = Field(ge=0, le=150)
    K: float = Field(ge=0, le=400)
    Ca: float = Field(ge=0, le=300)
    Mg: float = Field(ge=0, le=150)


class SimulateRequest(BaseModel):
    species: Literal["lettuce", "tomato", "cucumber", "strawberry", "spinach"] = "lettuce"
    ppfd: float = Field(ge=0, le=800)
    temp: float = Field(ge=0, le=40)
    ph: float = Field(ge=0, le=14)
    nutrients: Nutrients
    waterAvailable: bool = True
    lightHours: float = Field(default=16, ge=0, le=24)
    # lettuce-only Van Henten model inputs - ignored for other species
    co2: float = Field(default=420, ge=300, le=1500)
    plantDensity: float = Field(default=20, ge=5, le=40)
    harvestTargetG: float = Field(default=200, ge=50, le=500)


@app.post("/simulate")
def simulate(req: SimulateRequest):
    params = {
        "species": req.species,
        "ppfd": req.ppfd, "temp": req.temp, "ph": req.ph,
        "nutrients": req.nutrients.model_dump(),
        "water_available": req.waterAvailable,
        "light_hours": req.lightHours,
        "co2": req.co2,
        "plant_density": req.plantDensity,
        "harvest_target_g": req.harvestTargetG,
    }
    return {"mechanistic": simulator.simulate(params)}


@app.get("/species")
def species():
    return {sid: {"name": sp["name"], "cropType": sp["cropType"]} for sid, sp in simulator.SPECIES.items()}


@app.get("/health")
def health():
    return {"status": "ok", "species": list(simulator.SPECIES.keys())}
