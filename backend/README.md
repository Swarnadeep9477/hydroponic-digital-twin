# Hydroponic Growth Engine (backend)

The real prediction engine behind the "Run Simulation" button. Given the
grow-bed parameters you set (light, temperature, pH, N/P/K/Ca/Mg, water
flow) and which crop is planted, it predicts how the plant will actually
grow: days to harvest (or whether it will reach harvest at all), leaf
count, canopy size, and either fresh biomass (leafy crops) or fruit
count/weight (fruiting crops), plus a quality grade with any deficiency
symptoms detected - the same kind of metrics used for real harvest-quality
checks in agriculture.

- `simulator.py` - the mechanistic "ground truth" model. Supports five
  species (lettuce, spinach, tomato, cucumber, strawberry), each with its
  own cardinal temperatures, DLI/EC/pH targets and nutrient optima. Timing
  is driven by Growing Degree Days (a real crop-science technique - warmer
  days advance development faster than cool ones, up to a species-specific
  cap) rather than flat calendar days. Leafy species partition growth into
  leaf canopy; fruiting species undergo a modeled flowering transition
  where growth diverts into fruit count/weight instead (a single harvest
  flush, not continuous multi-flush cropping). Deficiency symptoms are
  species-aware too - calcium deficiency shows as tip-burn on leafy crops
  but blossom-end rot risk on fruiting crops, since both stem from the same
  real mechanism (calcium is immobile in the plant) manifesting on whichever
  tissue is the strongest calcium sink for that crop type.
- `app.py` - the FastAPI server. `POST /simulate` takes `species` (one of
  `lettuce`/`tomato`/`cucumber`/`strawberry`/`spinach`, defaults to
  `lettuce`) plus the grow-bed parameters, and returns the simulator's full
  day-by-day trajectory for animating the plant and building the harvest
  report.

## Run it

```bash
cd backend
python -m venv venv                 # first time only
venv\Scripts\activate                # Windows
pip install -r requirements.txt      # first time only
uvicorn app:app --reload --port 8000
```

Leave this running, then open `index.html` (ideally via a local static
server, e.g. `python -m http.server` from the project root) and hit
**Run Simulation**.
