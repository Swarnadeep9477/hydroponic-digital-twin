"""
Multi-species growth simulator - the mechanistic "ground truth" engine.

Every constant here is grounded in real horticultural science for each
species, cited in comments near SPECIES below. Given a fixed set of
environmental parameters (as if you set the dials once and let the whole
cycle play out), this simulates the full day-by-day growth trajectory and
reports real agricultural harvest-quality metrics.

Two crop archetypes are modeled differently, because they really do grow
differently:
  - "vegetative" crops (lettuce, spinach) partition everything into leaf
    canopy - final quality is leaf count / fresh weight / canopy size.
  - "fruiting" crops (tomato, cucumber, strawberry) undergo a vegetative
    phase, then a flowering/fruit-set transition where a share of growth
    diverts into fruit instead of leaves - final quality is fruit count and
    weight (plus a smaller vegetative canopy). This models a single harvest
    flush (first fruit set maturing together), not continuous multi-flush
    cropping across the plant's whole life - a deliberate simplification.

Timing is driven by Growing Degree Days (GDD): each day contributes
max(0, min(temp, T_MAX) - T_BASE) degree-days toward a species-specific
thermal target, so a cool day advances development less than a warm one
regardless of the day-count. This replaces treating every calendar day as
developmentally equal. Separately, a floor/plateau/ceiling temperature
*quality* score still feeds into growth-rate/stress/grade - real crops have
a wider thermal window for "development happens at all" (GDD) than for
"development happens efficiently" (photosynthetic optimum), so modeling
both is more accurate than collapsing them into one number.
"""
import math

# ---- universal Gompertz sigmoidal growth curve ----
# M(x) = A * exp(-B * exp(-k*x)) is the standard published model for
# sigmoidal crop biomass-over-time curves in precision-agriculture
# literature: slow establishment, fast "bulking up" phase, plateau near
# harvest. The curve's shape (B, k) is treated as universal across species -
# there's no reliable per-species-calibrated steepness data available here -
# what varies per species is how much accumulated thermal time (GDD) it
# takes to traverse it, via GDD_TARGET below.
GOMPERTZ_B = 6
GOMPERTZ_K = 0.15
GOMPERTZ_REF = 40  # the pseudo-day scale these constants were tuned against


def gompertz_maturity(pseudo_age: float) -> float:
    return math.exp(-GOMPERTZ_B * math.exp(-GOMPERTZ_K * pseudo_age))


GOMPERTZ_NORM = gompertz_maturity(GOMPERTZ_REF)

# ---- species parameter table ----
# Cardinal temperatures, DLI/PPFD targets, pH/EC windows and nutrient optima
# per species. Sourced from commonly-cited hydroponic/CEA horticultural
# ranges (base temperatures per published GDD tables; DLI/EC/pH windows per
# standard hydroponic nutrient-solution references). These are reasonable,
# literature-typical midpoints - not values fitted to a specific measured
# experimental dataset for each crop.
SPECIES = {
    "lettuce": {
        "name": "Lettuce", "cropType": "vegetative",
        "tBase": 5, "tOptLow": 18, "tOptHigh": 22, "tMax": 30,
        "gddTarget": 500,
        "dliOptimal": 15.5,
        "photoinhibitionThresholdPpfd": 380, "photoinhibitionMaxPenalty": 0.45,
        "phOptimal": 6.0, "phTolerance": 1.5,
        "nutrientOptima": {"N": 180, "P": 55, "K": 230, "Ca": 170, "Mg": 55},
        "ecSafeCeilingMult": 1.3, "ecDangerMult": 2.0,
        "seedlingLeaves": 2, "harvestLeaves": 28,
        "harvestWeightG": 220, "harvestCanopyCm": 28,
        "daysHorizon": 90,
    },
    "spinach": {
        "name": "Spinach", "cropType": "vegetative",
        "tBase": 2, "tOptLow": 15, "tOptHigh": 18, "tMax": 24,
        "gddTarget": 350,
        "dliOptimal": 13.5,
        "photoinhibitionThresholdPpfd": 320, "photoinhibitionMaxPenalty": 0.45,
        "phOptimal": 6.3, "phTolerance": 1.3,
        "nutrientOptima": {"N": 200, "P": 60, "K": 250, "Ca": 160, "Mg": 50},
        "ecSafeCeilingMult": 1.3, "ecDangerMult": 2.0,
        "seedlingLeaves": 2, "harvestLeaves": 22,
        "harvestWeightG": 150, "harvestCanopyCm": 22,
        "daysHorizon": 70,
    },
    "tomato": {
        "name": "Tomato", "cropType": "fruiting",
        "tBase": 10, "tOptLow": 21, "tOptHigh": 26, "tMax": 35,
        "gddTarget": 1300,
        "dliOptimal": 25,
        "photoinhibitionThresholdPpfd": 650, "photoinhibitionMaxPenalty": 0.4,
        "phOptimal": 6.0, "phTolerance": 1.0,
        "nutrientOptima": {"N": 200, "P": 60, "K": 300, "Ca": 180, "Mg": 60},
        "ecSafeCeilingMult": 1.4, "ecDangerMult": 2.2,
        "seedlingLeaves": 2, "matureLeafCount": 35, "harvestCanopyCm": 45,
        "floweringGddFrac": 0.35, "fruitCountTarget": 16, "fruitWeightGEach": 150,
        "daysHorizon": 200,
    },
    "cucumber": {
        "name": "Cucumber", "cropType": "fruiting",
        "tBase": 12, "tOptLow": 24, "tOptHigh": 28, "tMax": 38,
        "gddTarget": 650,
        "dliOptimal": 21.5,
        "photoinhibitionThresholdPpfd": 600, "photoinhibitionMaxPenalty": 0.4,
        "phOptimal": 5.9, "phTolerance": 1.0,
        "nutrientOptima": {"N": 190, "P": 55, "K": 280, "Ca": 170, "Mg": 55},
        "ecSafeCeilingMult": 1.4, "ecDangerMult": 2.2,
        "seedlingLeaves": 2, "matureLeafCount": 30, "harvestCanopyCm": 50,
        "floweringGddFrac": 0.3, "fruitCountTarget": 10, "fruitWeightGEach": 250,
        "daysHorizon": 120,
    },
    "strawberry": {
        "name": "Strawberry", "cropType": "fruiting",
        "tBase": 7, "tOptLow": 18, "tOptHigh": 24, "tMax": 30,
        "gddTarget": 900,
        "dliOptimal": 18.5,
        "photoinhibitionThresholdPpfd": 450, "photoinhibitionMaxPenalty": 0.45,
        "phOptimal": 5.8, "phTolerance": 1.0,
        "nutrientOptima": {"N": 150, "P": 50, "K": 200, "Ca": 150, "Mg": 50},
        # strawberry roots are notably salinity-sensitive - a tighter EC ceiling
        "ecSafeCeilingMult": 1.15, "ecDangerMult": 1.6,
        "seedlingLeaves": 3, "matureLeafCount": 20, "harvestCanopyCm": 25,
        "floweringGddFrac": 0.4, "fruitCountTarget": 8, "fruitWeightGEach": 18,
        "daysHorizon": 160,
    },
}

HARVEST_MATURITY = 0.95
NUTRIENT_KEYS = ["N", "P", "K", "Ca", "Mg"]


# ---- temperature ----
# Floor/plateau/ceiling productivity curve (photosynthetic efficiency has a
# narrower optimum than raw phenological development does) - used for
# growth-rate quality, stress and grading, NOT for the GDD developmental
# clock (see gdd_daily below).
def temperature_factor(t: float, sp: dict) -> float:
    t_base, t_opt_low, t_opt_high, t_max = sp["tBase"], sp["tOptLow"], sp["tOptHigh"], sp["tMax"]
    if t <= t_base or t >= t_max:
        return 0.0
    if t < t_opt_low:
        return (t - t_base) / (t_opt_low - t_base)
    if t <= t_opt_high:
        return 1.0
    return max(0.0, 1 - (t - t_opt_high) / (t_max - t_opt_high))


# Thermal accumulation for phenology pacing: degrees above T_BASE, but zero
# outside [T_BASE, T_MAX] - matching temperature_factor's own floor/ceiling
# cutoffs, so lethal heat halts development instead of "capping out" at a
# fast pace (a plant baking above its ceiling isn't developing faster than
# one at its ceiling temperature, it's not developing at all).
def gdd_daily(t: float, sp: dict) -> float:
    if t <= sp["tBase"] or t >= sp["tMax"]:
        return 0.0
    return t - sp["tBase"]


# ---- light ----
# C3 photosynthesis follows a saturating response to total daily light
# (Daily Light Integral, DLI = PPFD * light_hours * 0.0036), while sustained
# excess *instantaneous* PPFD is a separate photoinhibition/tip-burn risk
# regardless of duration - two distinct real mechanisms, modeled separately.
def dli_factor(dli: float, sp: dict) -> float:
    half_sat = sp["dliOptimal"] / 2.3  # saturation(dliOptimal) ~= 0.9
    return 1 - math.exp(-dli / half_sat)


def photoinhibition_factor(ppfd: float, sp: dict) -> float:
    threshold = sp["photoinhibitionThresholdPpfd"]
    max_penalty = sp["photoinhibitionMaxPenalty"]
    ppfd_ceiling = 800  # slider ceiling, used only to shape the penalty slope
    slope = max_penalty / max(1.0, ppfd_ceiling - threshold)
    excess = max(0.0, ppfd - threshold)
    return 1 - min(max_penalty, excess * slope)


# ---- pH ----
def ph_factor(ph: float, sp: dict) -> float:
    return max(0.0, 1 - abs(ph - sp["phOptimal"]) / sp["phTolerance"])


# ---- nutrients ----
def nutrient_score(nutrients: dict, key: str, sp: dict) -> float:
    opt = sp["nutrientOptima"][key]
    return max(0.0, 1 - abs(nutrients[key] - opt) / opt)


# Liebig's Law of the Minimum (Justus von Liebig, 1840s): growth is
# bottlenecked by whichever single nutrient is scarcest relative to need.
def nutrient_sufficiency(nutrients: dict, sp: dict) -> float:
    return min(nutrient_score(nutrients, k, sp) for k in NUTRIENT_KEYS)


# ---- EC / total salt load (osmotic ceiling - distinct from Liebig's law) ----
def compute_ec(nutrients: dict) -> float:
    return sum(nutrients.values()) / 700


def ec_factor(ec: float, sp: dict) -> float:
    ec_optimal = sum(sp["nutrientOptima"].values()) / 700
    safe_ceiling = ec_optimal * sp["ecSafeCeilingMult"]
    if ec <= safe_ceiling:
        return 1.0
    span = ec_optimal * (sp["ecDangerMult"] - sp["ecSafeCeilingMult"])
    return max(0.15, 1 - (ec - safe_ceiling) / span)


# ---- deficiency symptoms ----
# Mobile nutrients (N, P, K, Mg) get remobilized away from OLDER/outer
# leaves toward new growth, so deficiency shows there first - true across
# species. Calcium is immobile, so deficiency instead hits the youngest
# actively-expanding tissue: for a leafy vegetative crop that's new
# leaves/growing point (tip burn); for a fruiting crop, developing fruit are
# an even stronger calcium sink than young leaves, so the same immobility
# manifests as blossom-end rot instead.
_MOBILE_SYMPTOMS = {
    "N":  {"bucket": "outer", "hex": 0xcbbf6a, "label": "Nitrogen deficiency (chlorosis - yellowing on older leaves)"},
    "P":  {"bucket": "outer", "hex": 0x5a3450, "label": "Phosphorus deficiency (purple-red discoloration on older leaves)"},
    "K":  {"bucket": "outer", "hex": 0x8a6a3a, "label": "Potassium deficiency (marginal scorch on older leaves)"},
    "Mg": {"bucket": "outer", "hex": 0xc9d97a, "label": "Magnesium deficiency (interveinal chlorosis on older leaves)"},
}


def nutrient_symptoms_for(sp: dict) -> dict:
    symptoms = dict(_MOBILE_SYMPTOMS)
    if sp["cropType"] == "fruiting":
        symptoms["Ca"] = {"bucket": "fruit", "hex": 0x6b2b2b,
                           "label": "Calcium deficiency (blossom-end rot risk on developing fruit)"}
    else:
        symptoms["Ca"] = {"bucket": "inner", "hex": 0x2a1810,
                           "label": "Calcium deficiency (tip burn on new growth)"}
    return symptoms


def dominant_symptom(nutrients: dict, bucket: str, sp: dict):
    symptoms = nutrient_symptoms_for(sp)
    worst_key, worst_severity = None, 0.0
    for k in NUTRIENT_KEYS:
        if symptoms[k]["bucket"] != bucket:
            continue
        severity = 1 - nutrient_score(nutrients, k, sp)
        if severity > worst_severity:
            worst_key, worst_severity = k, severity
    if not worst_key:
        return None
    meta = symptoms[worst_key]
    return {"nutrient": worst_key, "severity": round(worst_severity, 4), "hex": meta["hex"], "label": meta["label"]}


# ---- Van Henten (1994) two-state lettuce growth model ----
# A mechanistic alternative to the generic Gompertz-curve model above,
# specific to lettuce. Instead of a phenomenological maturity curve, it
# integrates two coupled ODEs for structural dry matter (Xsdm - permanent
# plant structure, monotonically non-decreasing) and non-structural dry
# matter (Xnsdm - the sugar/carbohydrate buffer produced by photosynthesis
# and drawn down by growth+respiration, can rise and fall). Structural
# growth rate is throttled by how full that buffer currently is, and
# photosynthesis itself saturates with both light and CO2 via a
# Farquhar-style co-limitation term. Source: Van Henten, E.J. (1994),
# "Validation of a dynamic lettuce growth model for greenhouse climate
# control", Agricultural Systems 45(1), 55-72; parameter values cross-checked
# against Van Ooteghem (2007), "Optimal Control Design for a Solar
# Greenhouse" (Wageningen PhD thesis), which reproduces the same model.
VAN_HENTEN = {
    "c_alpha": 0.68,        # CO2 -> CH2O conversion efficiency
    "c_beta": 0.8,          # growth yield factor (synthesis efficiency)
    "c_gr_max": 5e-6,       # max specific growth rate @ 20C, s^-1
    "c_gamma": 1.0,         # growth-rate response shape coefficient
    "c_Q10_gr": 1.6,        # growth rate temperature sensitivity, per 10C
    "c_resp_sht": 3.47e-7,  # shoot maintenance respiration @ 25C, s^-1
    "c_resp_rt": 1.16e-7,   # root maintenance respiration @ 25C, s^-1
    "c_Q10_resp": 2.0,      # respiration temperature sensitivity, per 10C
    "c_tau": 0.14,          # root dry-mass fraction (hydroponic NFT)
    "c_K": 0.9,             # canopy light extinction coefficient
    "c_lar": 0.075,         # structural leaf area ratio, m^2/g
    "c_omega": 1.83e-3,     # CO2 mass-density conversion factor, g/m^3 per ppm
    "c_Gamma": 40.0,        # CO2 compensation point @ 20C, ppm
    "c_Q10_Gamma": 2.0,     # compensation-point temperature sensitivity, per 10C
    "c_epsilon": 17e-6,     # quantum use efficiency, g CO2/J
    "g_bnd": 0.007,         # boundary-layer conductance, m/s
    "g_stm": 0.005,         # stomatal conductance, m/s
    "dry_matter_fraction": 0.05,  # lettuce fresh-weight dry-matter content
    "xsdm0": 0.72,          # seedling structural dry mass at transplant, g/m^2
    "xnsdm0": 0.25,         # seedling non-structural dry mass at transplant, g/m^2
}
SECONDS_PER_DAY = 86400
PAR_UMOL_PER_W = 4.6  # standard PAR photon-flux-to-irradiance conversion

# ---- planting density (fixed by the physical rack, not a free dial) ----
# The 3D grow bed has a fixed 6-channel x 9-hole layout regardless of how
# many of those holes are actually planted, so "plants per m^2" isn't
# something a grower dials in independently here - it's a fact about the
# rack. GROW_BED_AREA_M2 is a nominal floor-area assumption (not the 3D
# scene's literal unit scale, which is sized for click/drag usability, not
# real-world dimensions) chosen so the fixed hole count works out to the
# literature-typical ~20 plants/m^2 NFT lettuce density. Held constant so
# per-plant yield depends only on growing conditions, not on how many of
# the 54 holes happen to be filled.
GROW_BED_HOLES = 54
GROW_BED_AREA_M2 = 2.7
PLANT_DENSITY = GROW_BED_HOLES / GROW_BED_AREA_M2  # = 20 plants/m^2

# ---- per-lever nutrient/pH/water/EC stress coupling into Van Henten ----
# Van Henten's original equations assume ideal nutrition always. Rather than
# bolting on one blanket "stress multiplier" (which would make every kind of
# stress collapse into the same undifferentiated penalty), each stressor is
# routed to the *specific* photosynthetic lever real plant physiology ties
# it to, so a Mg deficiency and a K deficiency produce visibly different,
# individually attributable effects instead of one generic number:
#   - Nitrogen builds Rubisco -> scales the CO2-limited (carboxylation) term
#     (Evans, J.R. 1989, "Photosynthesis and nitrogen relationships in
#     leaves of C3 plants", Oecologia 78(1), 9-19).
#   - Magnesium is the central atom of chlorophyll -> scales quantum
#     (light-capture) efficiency directly.
#   - Potassium drives guard-cell turgor -> scales stomatal conductance
#     (classic stomatal physiology, e.g. Humble & Raschke 1971).
#   - Water stress and EC/salinity both act on the same guard-cell turgor
#     mechanism as potassium, so they multiply into the same stomatal
#     conductance term rather than getting a separate lever (the standard
#     multiplicative-conductance approach to environmental stress, per
#     Jarvis, P.G. 1976, Phil. Trans. R. Soc. B 273(927), 593-610).
#   - pH doesn't touch photosynthesis directly - it gates how much of the
#     N/K/Mg in the tank actually reaches the plant, via the same per-
#     nutrient availability-window shape used elsewhere in this file.
#   - Phosphorus and calcium have no comparably clean single-parameter hook
#     in Van Henten's simplified two-term co-limitation model (P's role is
#     RuBP-regeneration/ATP limitation, a third limitation branch this model
#     doesn't have; Ca is structural/signaling, not a photosynthesis input)
#     - both are deliberately left unwired here and continue to only affect
#     the traditional Gompertz/Liebig model.
PH_NUTRIENT_AVAILABILITY = {
    "N":  (4.5, 5.0, 7.5, 8.0),
    "K":  (4.0, 4.5, 8.0, 8.5),
    "Mg": (5.0, 6.0, 8.0, 8.5),
}


def _ph_availability(ph: float, key: str) -> float:
    lo_min, lo, hi, hi_max = PH_NUTRIENT_AVAILABILITY[key]
    if ph <= lo_min or ph >= hi_max:
        return 0.0
    if ph < lo:
        return (ph - lo_min) / (lo - lo_min)
    if ph <= hi:
        return 1.0
    return (hi_max - ph) / (hi_max - hi)


def _nutrient_capacity(ppm: float, opt: float, ph: float, key: str) -> float:
    """Saturating (diminishing-returns) photosynthetic-capacity credit for
    one nutrient, same functional family as dli_factor: reaches ~90% right
    at the species' own optimum ppm, with pH-gated availability applied
    first via _ph_availability."""
    eff = ppm * _ph_availability(ph, key)
    half_sat = opt / 2.3
    if half_sat <= 0:
        return 1.0
    return 1 - math.exp(-eff / half_sat)


def _van_henten_rates(xsdm: float, xnsdm: float, temp_c: float, ppfd: float, co2_ppm: float, sp: dict,
                       cap_n: float = 1.0, cap_mg: float = 1.0, g_stm_mult: float = 1.0) -> tuple:
    c = VAN_HENTEN
    irradiance = ppfd / PAR_UMOL_PER_W  # umol.m-2.s-1 PPFD -> W.m-2 PAR

    compensation_pt = c["c_Gamma"] * c["c_Q10_Gamma"] ** ((temp_c - 20) / 10)
    # cap_mg: magnesium/chlorophyll throttle on light-capture efficiency
    quantum_eff = c["c_epsilon"] * cap_mg * (co2_ppm - compensation_pt) / (co2_ppm + 2 * compensation_pt)

    # canopy CO2 conductance: boundary-layer, stomatal and carboxylation
    # resistances in series (temperature-dependent carboxylation term).
    # g_stm_mult folds in potassium/water/EC - all three throttle the same
    # guard-cell turgor mechanism, so they combine multiplicatively here.
    g_car = max(1e-6, -1.32e-5 * temp_c ** 2 + 5.94e-4 * temp_c - 2.64e-3)
    g_stm_eff = max(1e-6, c["g_stm"] * g_stm_mult)
    g_co2 = 1 / (1 / c["g_bnd"] + 1 / g_stm_eff + 1 / g_car)

    co2_gradient = co2_ppm - compensation_pt
    light_term = quantum_eff * irradiance
    # cap_n: nitrogen/Rubisco throttle on carboxylation capacity
    co2_term = g_co2 * c["c_omega"] * co2_gradient * cap_n
    f_phot_max = max(0.0, (light_term * co2_term) / (light_term + co2_term)) if (light_term + co2_term) > 0 else 0.0

    # Van Henten's 1994 model has no photoinhibition term of its own - it was
    # validated within a PPFD range that never triggers it. This UI's slider
    # goes well past lettuce's photoinhibitionThresholdPpfd, so we reuse the
    # same empirical penalty applied to the generic model to keep both paths
    # consistent at high light rather than letting Van Henten extrapolate
    # unbounded growth benefit from PPFD the plant can't actually use.
    f_phot_max *= photoinhibition_factor(ppfd, sp)

    canopy_closure = 1 - math.exp(-c["c_K"] * c["c_lar"] * (1 - c["c_tau"]) * xsdm)
    f_phot = canopy_closure * f_phot_max

    q10_resp = c["c_Q10_resp"] ** ((temp_c - 25) / 10)
    f_resp = (c["c_resp_sht"] * (1 - c["c_tau"]) * xsdm + c["c_resp_rt"] * c["c_tau"] * xsdm) * q10_resp

    denom = c["c_gamma"] * xsdm + xnsdm
    r_gr = c["c_gr_max"] * (xnsdm / denom if denom > 0 else 0.0) * c["c_Q10_gr"] ** ((temp_c - 20) / 10)

    d_xsdm = r_gr * xsdm
    growth_resp = ((1 - c["c_beta"]) / c["c_beta"]) * r_gr * xsdm
    d_xnsdm = c["c_alpha"] * f_phot - r_gr * xsdm - f_resp - growth_resp
    return d_xsdm, d_xnsdm


SUBSTEPS_PER_PHASE = 24  # numerical-integration resolution within each light/dark phase


def simulate_lettuce_van_henten(temp: float, ppfd: float, co2_ppm: float,
                                 harvest_target_g: float, sp: dict,
                                 nutrients: dict, ph: float, water_available: bool = True,
                                 light_hours: float = 16, days_horizon: int = 50) -> dict:
    """
    Day-by-day integration of the Van Henten two-state ODE model, holding
    temp/ppfd/co2/nutrients/ph/water fixed across the run (same "set the
    dials once" convention as the rest of this simulator). Each day is
    split into a lit phase (photosynthesis + respiration, light_hours long)
    and a dark phase (respiration only, drawing down the non-structural
    reserve - real plants keep growing/respiring overnight on stored
    carbohydrate, they just stop fixing new carbon) rather than treating
    PPFD as if it were constant for all 24 hours, which would double-count
    light hours the plant doesn't get and badly overstate growth. Each
    phase is substepped for numerical accuracy, since the early growth
    phase is numerically stiff (Xnsdm/Xsdm ratio, and hence r_gr, changes
    fast while Xsdm is still small).

    Nitrogen/potassium/magnesium, pH, water availability and EC each throttle
    a specific photosynthetic lever rather than one shared penalty - see the
    per-lever stress coupling comment above _van_henten_rates. Phosphorus and
    calcium have no such hook here and only affect the traditional model.

    Returns per-day and final structural/non-structural/leaf/root/total
    biomass plus days-to-harvest against a target fresh head weight.
    days_horizon defaults to 50 - beyond the ~35-49 day window Van Henten's
    1994 paper actually validated, this model has no senescence/self-shading
    ceiling and will keep extrapolating growth indefinitely, so results
    past that window shouldn't be trusted as more than a rough trend.
    """
    c = VAN_HENTEN
    opt = sp["nutrientOptima"]
    cap_n = _nutrient_capacity(nutrients["N"], opt["N"], ph, "N")
    cap_k = _nutrient_capacity(nutrients["K"], opt["K"], ph, "K")
    cap_mg = _nutrient_capacity(nutrients["Mg"], opt["Mg"], ph, "Mg")
    water_f = 1.0 if water_available else 0.0
    ec_f = ec_factor(compute_ec(nutrients), sp)
    g_stm_mult = cap_k * water_f * ec_f

    xsdm, xnsdm = c["xsdm0"], c["xnsdm0"]
    trajectory = []
    days_to_harvest = None
    light_s = light_hours * 3600
    dark_s = (24 - light_hours) * 3600

    for day in range(days_horizon + 1):
        total_gm2 = xsdm + xnsdm
        leaf_gm2 = (1 - c["c_tau"]) * total_gm2
        root_gm2 = c["c_tau"] * total_gm2
        total_g_per_plant = total_gm2 / PLANT_DENSITY
        fresh_g_per_plant = total_g_per_plant / c["dry_matter_fraction"]

        trajectory.append({
            "day": day,
            "sdmGm2": round(xsdm, 4), "nsdmGm2": round(xnsdm, 4),
            "totalBiomassGm2": round(total_gm2, 4),
            "leafBiomassG": round(leaf_gm2 / PLANT_DENSITY, 4),
            "rootBiomassG": round(root_gm2 / PLANT_DENSITY, 4),
            "totalBiomassG": round(total_g_per_plant, 4),
            "freshWeightG": round(fresh_g_per_plant, 2),
        })

        if days_to_harvest is None and fresh_g_per_plant >= harvest_target_g:
            days_to_harvest = day

        for phase_ppfd, phase_seconds in ((ppfd, light_s), (0.0, dark_s)):
            if phase_seconds <= 0:
                continue
            dt = phase_seconds / SUBSTEPS_PER_PHASE
            for _ in range(SUBSTEPS_PER_PHASE):
                d_xsdm, d_xnsdm = _van_henten_rates(xsdm, xnsdm, temp, phase_ppfd, co2_ppm, sp,
                                                     cap_n=cap_n, cap_mg=cap_mg, g_stm_mult=g_stm_mult)
                xsdm = max(0.0, xsdm + d_xsdm * dt)
                xnsdm = max(0.0, xnsdm + d_xnsdm * dt)

    final = trajectory[-1]
    return {
        "willReachHarvest": days_to_harvest is not None,
        "daysToHarvest": days_to_harvest,
        "finalSdmGm2": final["sdmGm2"], "finalNsdmGm2": final["nsdmGm2"],
        "finalTotalBiomassGm2": final["totalBiomassGm2"],
        "finalLeafBiomassG": final["leafBiomassG"],
        "finalRootBiomassG": final["rootBiomassG"],
        "finalTotalBiomassG": final["totalBiomassG"],
        "finalFreshWeightG": final["freshWeightG"],
        "plantDensity": PLANT_DENSITY,
        "co2": co2_ppm,
        "harvestTargetG": harvest_target_g,
        "trajectory": trajectory,
        # per-lever stress breakdown (1.0 = no penalty) - lets the UI show
        # *which* stressor is responsible for lost yield, not just that one
        # exists. See the per-lever stress coupling comment above
        # _van_henten_rates for what each one physically represents.
        "stressFactors": {
            "nitrogenCapacity": round(cap_n, 4),
            "potassiumCapacity": round(cap_k, 4),
            "magnesiumCapacity": round(cap_mg, 4),
            "waterFactor": round(water_f, 4),
            "ecFactor": round(ec_f, 4),
            "stomatalConductanceMultiplier": round(g_stm_mult, 4),
        },
    }


def simulate(params: dict) -> dict:
    """
    params: {species, ppfd, temp, ph, nutrients: {N,P,K,Ca,Mg}, water_available, light_hours}
    Returns the full day-by-day trajectory plus a harvest-quality summary.
    """
    species_id = params.get("species", "lettuce")
    sp = SPECIES[species_id]
    ppfd = params["ppfd"]
    temp = params["temp"]
    ph = params["ph"]
    nutrients = params["nutrients"]
    water_available = params.get("water_available", True)
    light_hours = params.get("light_hours", 16)

    dli = ppfd * light_hours * 0.0036
    light = dli_factor(dli, sp) * photoinhibition_factor(ppfd, sp)
    temp_quality_f = temperature_factor(temp, sp)
    nut_f = nutrient_sufficiency(nutrients, sp)
    ph_f = ph_factor(ph, sp)
    ec = compute_ec(nutrients)
    ec_f = ec_factor(ec, sp)
    water_f = 1.0 if water_available else 0.0

    # non-thermal conditions throttle the pace of thermal-time accumulation
    # (a starved-of-light plant develops slower even if it's warm) - the
    # temperature's own pacing effect is already expressed via gdd_daily.
    nonthermal = light * nut_f * ph_f * water_f * ec_f
    growth_rate = nonthermal * temp_quality_f
    stress = 1 - min(nut_f, ph_f, water_f, ec_f, temp_quality_f)

    outer_symptom = dominant_symptom(nutrients, "outer", sp)
    secondary_bucket = "fruit" if sp["cropType"] == "fruiting" else "inner"
    secondary_symptom = dominant_symptom(nutrients, secondary_bucket, sp)

    trajectory = []
    days_to_harvest = None
    gdd_accum = 0.0
    days_horizon = sp["daysHorizon"]

    for day in range(0, days_horizon + 1):
        gdd_accum += gdd_daily(temp, sp) * nonthermal
        pseudo_age = (gdd_accum / sp["gddTarget"]) * GOMPERTZ_REF
        maturity = min(1.0, gompertz_maturity(pseudo_age) / GOMPERTZ_NORM)

        point = {"day": day, "maturity": round(maturity, 4)}

        if sp["cropType"] == "vegetative":
            leaf_count = round(sp["seedlingLeaves"] + (sp["harvestLeaves"] - sp["seedlingLeaves"]) * maturity)
            biomass_g = round((maturity ** 1.5) * sp["harvestWeightG"], 1)
            canopy_cm = round(3 + (sp["harvestCanopyCm"] - 3) * maturity, 1)
            point.update({"leafCount": leaf_count, "biomassG": biomass_g, "canopyCm": canopy_cm,
                          "fruitCount": None, "fruitWeightG": None, "totalYieldG": None})
        else:
            leaf_count = round(sp["seedlingLeaves"] + (sp["matureLeafCount"] - sp["seedlingLeaves"]) * maturity)
            canopy_cm = round(3 + (sp["harvestCanopyCm"] - 3) * maturity, 1)
            flowering_frac = sp["floweringGddFrac"]
            if maturity <= flowering_frac:
                fruit_progress = 0.0
            else:
                fruit_progress = min(1.0, (maturity - flowering_frac) / (1 - flowering_frac))
            fruit_count = round(fruit_progress * sp["fruitCountTarget"])
            fruit_weight_each = round((fruit_progress ** 1.3) * sp["fruitWeightGEach"], 1)
            total_yield_g = round(fruit_progress ** 1.3 * sp["fruitCountTarget"] * sp["fruitWeightGEach"], 1)
            point.update({"leafCount": leaf_count, "biomassG": None, "canopyCm": canopy_cm,
                          "fruitCount": fruit_count, "fruitWeightG": fruit_weight_each, "totalYieldG": total_yield_g})

        trajectory.append(point)
        if days_to_harvest is None and maturity >= HARVEST_MATURITY:
            days_to_harvest = day

    will_reach_harvest = days_to_harvest is not None
    final = trajectory[-1]

    if not will_reach_harvest:
        grade = "F"
    elif stress < 0.1:
        grade = "A"
    elif stress < 0.3:
        grade = "B"
    elif stress < 0.6:
        grade = "C"
    else:
        grade = "D"

    ph_low, ph_high = sp["phOptimal"] - sp["phTolerance"], sp["phOptimal"] + sp["phTolerance"]
    limiting_factors = []
    if not water_available:
        limiting_factors.append("no water flow reaching the grow bed")
    if light < 0.5:
        limiting_factors.append("insufficient or excessive light")
    if temp_quality_f < 0.5:
        limiting_factors.append("temperature outside the safe range for this crop")
    if nut_f < 0.5:
        limiting_factors.append("a nutrient deficiency or excess")
    if ph_f < 0.5:
        limiting_factors.append(f"pH far from the {ph_low:.1f}-{ph_high:.1f} target range")
    if ec_f < 0.5:
        limiting_factors.append("total nutrient concentration (EC) dangerously high")

    symptoms = [s["label"] for s in (outer_symptom, secondary_symptom) if s and s["severity"] > 0.15]

    result = {
        "species": species_id,
        "cropType": sp["cropType"],
        "growthRate": round(growth_rate, 4),
        "stress": round(stress, 4),
        "willReachHarvest": will_reach_harvest,
        "daysToHarvest": days_to_harvest,
        "limitingFactors": limiting_factors,
        "finalQuality": {
            "grade": grade,
            "maturity": final["maturity"],
            "leafCount": final["leafCount"],
            "canopyCm": final["canopyCm"],
            "biomassG": final["biomassG"],
            "fruitCount": final["fruitCount"],
            "fruitWeightG": final["fruitWeightG"],
            "totalYieldG": final["totalYieldG"],
        },
        "symptoms": symptoms,
        "outerSymptom": outer_symptom,
        "secondarySymptom": secondary_symptom,
        "trajectory": trajectory,
        "factors": {
            "light": round(light, 4), "temperature": round(temp_quality_f, 4),
            "nutrients": round(nut_f, 4), "ph": round(ph_f, 4), "ec": round(ec_f, 4),
        },
    }

    if species_id == "lettuce":
        result["vanHenten"] = simulate_lettuce_van_henten(
            temp=temp, ppfd=ppfd,
            co2_ppm=params.get("co2", 420),
            harvest_target_g=params.get("harvest_target_g", 200),
            sp=sp,
            nutrients=nutrients, ph=ph, water_available=water_available,
            light_hours=params.get("light_hours", 16),
            days_horizon=min(sp["daysHorizon"], 50),
        )

    return result
