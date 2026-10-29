/* ============================================================
   Klima-Rezepte — App-Logik
   ============================================================ */

(function () {
  "use strict";

  const APP_VERSION = "0.6";
  const LS_SETTINGS = "klimarezepte:settings:v1";
  const LS_SAVED = "klimarezepte:saved:v1";
  const LS_LAST3 = "klimarezepte:last3:v1";

  // ---------------- State ----------------
  const state = {
    settings: { personen: 2, diet: "keine", freitext: "", apiKey: "", model: "deepseek-chat" },
    wizard: { meal: "mittagessen", calorieFood: null, proteinFood: null, nutrientKey: NUTRIENTS[0].key, nutrientFood: null, zutat4: "", zutat5: "" },
    results: [],
    saved: [],
  };

  function q(id) { return document.getElementById(id); }

  // ---------------- Storage ----------------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      if (raw) Object.assign(state.settings, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }
  function saveSettingsToStorage() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings)); } catch (e) { /* ignore */ }
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(LS_SAVED);
      state.saved = raw ? JSON.parse(raw) : [];
    } catch (e) { state.saved = []; }
  }
  function persistSaved() {
    try { localStorage.setItem(LS_SAVED, JSON.stringify(state.saved)); } catch (e) { /* ignore, z.B. Speicherlimit */ }
  }
  function pushLast3(recipe) {
    let last3 = [];
    try { last3 = JSON.parse(localStorage.getItem(LS_LAST3)) || []; } catch (e) { last3 = []; }
    last3.unshift({ id: recipe.id, title: recipe.title, perPortion: recipe.perPortion, ts: Date.now() });
    last3 = last3.slice(0, 3);
    try { localStorage.setItem(LS_LAST3, JSON.stringify(last3)); } catch (e) { /* ignore */ }
  }
  function getLast3() {
    try { return JSON.parse(localStorage.getItem(LS_LAST3)) || []; } catch (e) { return []; }
  }

  // ---------------- Navigation ----------------
  const VIEWS = ["settings", "wizard", "loading", "results", "saved", "progress"];
  function showView(name) {
    VIEWS.forEach((v) => { q("view-" + v).hidden = v !== name; });
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === name);
    });
    if (name === "saved") renderSaved();
    if (name === "progress") renderProgress();
    window.scrollTo({ top: 0 });
  }

  // ---------------- Settings view ----------------
  function renderDietChips() {
    const box = q("diet-chips");
    box.innerHTML = "";
    DIET_MODES.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = d.label;
      btn.dataset.key = d.key;
      btn.setAttribute("aria-pressed", String(state.settings.diet === d.key));
      btn.addEventListener("click", () => {
        state.settings.diet = d.key;
        box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.key === d.key)));
        populateCalorieDropdown();
        populateProteinDropdown();
        populateNutrientSourceDropdown();
      });
      box.appendChild(btn);
    });
  }

  function fillSettingsForm() {
    q("inp-personen").value = state.settings.personen;
    q("inp-freitext").value = state.settings.freitext;
    q("inp-apikey").value = state.settings.apiKey;
    q("inp-model").value = state.settings.model || "deepseek-chat";
  }

  function saveSettingsFromForm() {
    state.settings.personen = Math.max(1, parseInt(q("inp-personen").value, 10) || 2);
    state.settings.freitext = q("inp-freitext").value.trim();
    state.settings.apiKey = q("inp-apikey").value.trim();
    state.settings.model = q("inp-model").value.trim() || "deepseek-chat";
    saveSettingsToStorage();
    const confirmEl = q("save-confirm");
    confirmEl.hidden = false;
    setTimeout(() => { confirmEl.hidden = true; }, 2500);
  }

  // ---------------- Wizard view ----------------
  function renderMealChips() {
    const box = q("meal-chips");
    box.innerHTML = "";
    MEAL_TYPES.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = m.label;
      btn.dataset.key = m.key;
      btn.setAttribute("aria-pressed", String(state.wizard.meal === m.key));
      btn.addEventListener("click", () => {
        state.wizard.meal = m.key;
        box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.key === m.key)));
        updateSavedHint();
      });
      box.appendChild(btn);
    });
  }

  function foodOptionLabel(entry, unitLabel) {
    return entry.food.name + " — " + entry.value.toFixed(3) + " g CO2/" + unitLabel;
  }

  function populateCalorieDropdown() {
    const sel = q("sel-calorie");
    const list = sortedCalorieSources().filter((x) => allowedByDiet(x.food.name, state.settings.diet) && isMainFood(x.food));
    const avg = averageValue(list);
    sel.innerHTML = "";
    list.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.food.name;
      opt.textContent = co2ColorEmoji(entry.value, avg) + " " + foodOptionLabel(entry, "kcal");
      sel.appendChild(opt);
    });
    state.wizard.calorieFood = list.length ? list[0].food.name : null;
  }

  const NONE_VALUE = "__keine__";

  function populateProteinDropdown() {
    const sel = q("sel-protein");
    const list = sortedProteinSources().filter((x) => allowedByDiet(x.food.name, state.settings.diet) && isMainFood(x.food));
    const avg = averageValue(list);
    sel.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = NONE_VALUE;
    noneOpt.textContent = "Keine — keine Vorgabe für Zutat 2";
    sel.appendChild(noneOpt);
    list.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.food.name;
      opt.textContent = co2ColorEmoji(entry.value, avg) + " " + foodOptionLabel(entry, "g Eiweiß");
      sel.appendChild(opt);
    });
    state.wizard.proteinFood = list.length ? list[0].food.name : null;
  }

  function populateNutrientTypeDropdown() {
    const sel = q("sel-nutrient-type");
    sel.innerHTML = "";
    NUTRIENTS.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n.key;
      opt.textContent = n.label;
      sel.appendChild(opt);
    });
    sel.value = state.wizard.nutrientKey;
  }

  function populateNutrientSourceDropdown() {
    const sel = q("sel-nutrient-source");
    const meta = NUTRIENTS.find((n) => n.key === state.wizard.nutrientKey);
    q("nutrient-panel-title").textContent = "4. Zutat 3 – " + meta.label + "-Lieferant";
    const list = sortedNutrientSources(state.wizard.nutrientKey).filter((x) => allowedByDiet(x.food.name, state.settings.diet) && isMainFood(x.food));
    const avg = averageValue(list);
    sel.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = NONE_VALUE;
    noneOpt.textContent = "Keine — keine Vorgabe für Zutat 3";
    sel.appendChild(noneOpt);
    list.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.food.name;
      opt.textContent = co2ColorEmoji(entry.value, avg) + " " + foodOptionLabel(entry, meta.unit + " " + meta.label);
      sel.appendChild(opt);
    });
    state.wizard.nutrientFood = list.length ? list[0].food.name : null;
  }

  // Befüllt die <datalist>s fuer Zutat 4/5 -- bewusst UNGEFILTERT mit allen
  // Lebensmitteln (alphabetisch), damit z.B. auch Tomaten frei waehlbar sind.
  function populateFreeZutatDatalists() {
    const all = allFoodsAlphabetical();
    populateZutatDatalist("datalist-zutat4", all);
    populateZutatDatalist("datalist-zutat5", all);
  }
  function populateZutatDatalist(datalistId, foodList) {
    const dl = q(datalistId);
    dl.innerHTML = "";
    foodList.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.name;
      dl.appendChild(opt);
    });
  }

  // Aktualisiert state.wizard.zutat4/5 und zeigt bei exaktem Treffer ein
  // farbiges Badge mit dem CO2/kcal-Wert der gewählten Zutat.
  function updateFreeZutat(key, text) {
    state.wizard[key] = text;
    const badge = q(key === "zutat4" ? "badge-zutat4" : "badge-zutat5");
    const match = FOODS.find((f) => f.name.toLowerCase() === text.trim().toLowerCase());
    if (!match) { badge.hidden = true; return; }
    const list = sortedCalorieSources().filter((x) => isMainFood(x.food));
    const avg = averageValue(list);
    const value = co2PerKcal(match);
    badge.hidden = false;
    if (value !== null) {
      badge.textContent = co2ColorEmoji(value, avg) + " " + match.name + " — " + value.toFixed(3) + " g CO2/kcal";
    } else {
      badge.textContent = match.name + " — " + match.co2.toFixed(2) + " kg CO2e/kg";
    }
  }

  function updateSavedHint() {
    const matches = findMatchingSaved(state.wizard.meal, state.settings.diet);
    const hint = q("saved-hint");
    if (matches.length > 0) {
      hint.textContent = matches.length + " passende gespeicherte Rezept(e) gefunden — werden bevorzugt verwendet, bevor neue generiert werden.";
    } else {
      hint.textContent = "";
    }
  }

  // ---------------- Ingredient matching ----------------
  // WICHTIG: Tabelle muss zur AKTUELLEN Datenbank (420 Lebensmittel) passen.
  const MATCH_ALIASES = {
    "zwiebel": "Zwiebeln, frisch",
    "tomate": "Tomaten, Durchschnitt",
    "tomatenmark": "Tomatenmark", "kirschtomate": "Tomaten, Kirschtomaten",
    "hafermilch": "Milch-Ersatz, Hafer", "haferdrink": "Milch-Ersatz, Hafer",
    "mandelmilch": "Milch-Ersatz, Mandel", "kokosmilch": null, "buttermilch": null,
    "erdnussbutter": "Erdnussbutter", "wasser": "Leitungswasser",
    "feta": "Käse, Feta", "mozzarella": "Mozzarella", "frischkäse": "Käse, Frischkäse",
    "hackfleisch": "Rinder-Hackfleisch", "hühnchen": "Hähnchen, Durchschnitt",
    "speiseöl": "Rapsöl, Durchschnitt", "pflanzenöl": "Rapsöl, Durchschnitt", "öl": "Rapsöl, Durchschnitt",
    "salz": "Speisesalz, raffiniert", "pfeffer": "Pfeffer, schwarz, gemahlen",
    "kartoffel": "Kartoffeln, frisch",
    "möhre": "Karotten (Möhren)", "karotte": "Karotten (Möhren)",
    "paprika": "Paprika, frisch",
    "vollkornnudeln": "Nudeln, Durchschnitt", "spaghetti": "Nudeln, Durchschnitt", "nudel": "Nudeln, Durchschnitt",
    "haferflocke": "Haferflocken, Durchschnitt",
    "milch": "Milch, Vollmilch",
    "ei": "Ei, Durchschnitt",
    "käse": "Käse, Durchschnitt", "parmesan": "Käse, Hartkäse (Parmesan-Art)",
    "tofu": "Tofu, Durchschnitt",
    "linse": "Linsen, getrocknet",
    "erbse": "Erbsen, gefroren",
    "mais": "Mais, Dose",
    "reis": "Reis, Durchschnitt",
    "apfel": "Apfel, Durchschnitt", "äpfel": "Apfel, Durchschnitt",
    "banane": "Banane, frisch",
    "orange": "Orange (Apfelsine)",
    "weißkohl": "Weißkohl, frisch",
    "eisbergsalat": "Eissalat (Freiland, Deutschland)", "salat": "Eissalat (Freiland, Deutschland)",
    "brokkoli": "Brokkoli, frisch",
    "erdnuss": "Erdnüsse, in Schale", "erdnüsse": "Erdnüsse, in Schale",
    "mandel": "Mandeln",
    "rapsöl": "Rapsöl, Durchschnitt",
    "sojamilch": "Milch-Ersatz, Soja",
    "zucker": "Zucker, Rohrzucker",
    "knoblauch": "Knoblauch, frisch",
    "ingwer": "Ingwer, frisch",
    "spinat": "Spinat, frisch",
    "gurke": "Salatgurke",
    "joghurt": "Joghurt, natur",
    "sahne": "Sahne",
    "quark": "Quark, 40% Fett",
    "brot": "Brot, Mischbrot",
    "mehl": "Weizenmehl",
    "hähnchen": "Hähnchen, Durchschnitt",
    "rinderhack": "Rinder-Hackfleisch", "rindfleisch": "Rindfleisch, Durchschnitt", "rind": "Rindfleisch, Durchschnitt",
    "schweinefleisch": "Schweinefleisch, Durchschnitt", "schwein": "Schweinefleisch, Durchschnitt",
    "lachs": "Lachs (Zucht)",
    "champignon": "Champignons, frisch", "pilz": "Champignons, frisch",
    "kürbis": "Kürbis",
    "lauch": "Lauch (Porree)", "porree": "Lauch (Porree)",
    "sellerie": "Sellerie",
    "kichererbse": "Kichererbsen, Dose",
    "bohne": "Bohnen, weiß, Dose",
    "butter": "Butter, Durchschnitt",
    "olivenöl": "Olivenöl",
  };

  function normalizeName(s) {
    return s.toLowerCase().trim()
      .replace(/\(.*?\)/g, "")
      .replace(/[.,;].*$/, "")
      .trim();
  }

  // Laengere (spezifischere) Schluessel zuerst, damit z.B. "sojamilch" vor
  // "milch" und "tomatenmark" vor "tomate" greift.
  const ALIAS_KEYS = Object.keys(MATCH_ALIASES).sort((a, b) => b.length - a.length);

  // Wortbasierter Vergleich (kein reiner Teilstring!): verhindert, dass z.B.
  // "Salbei" auf "ei" oder "Preiselbeeren" auf "reis" zugeordnet wird.
  function aliasMatchesToken(token, key) {
    if (token === key) return true;
    for (const suf of ["n", "en", "e", "s", "er"]) if (token === key + suf) return true;
    return key.length >= 5 && token.startsWith(key); // Komposita: Hähnchenbrust, Schweinefleisch…
  }

  function findFoodMatch(ingredientName) {
    const norm = normalizeName(ingredientName || "");
    if (!norm) return null;
    // 0) Exakter VOLLER Datenbankname (z.B. "Tomaten (Bio)") hat Vorrang.
    const fullHit = FOODS.find((f) => f.name.toLowerCase() === ingredientName.trim().toLowerCase());
    if (fullHit) return fullHit;
    const tokens = norm.split(/[\s\/-]+/).filter(Boolean);
    // 1) Alias-Tabelle (wortbasiert) -- vor der Datenbanksuche, weil mehrere
    //    Datenbankzeilen auf denselben normalisierten Namen kollidieren.
    for (const key of ALIAS_KEYS) {
      if (norm === key || tokens.some((t) => aliasMatchesToken(t, key))) {
        const target = MATCH_ALIASES[key];
        if (target === null) return null; // bewusst "nicht in Datenbank"
        const f = FOODS.find((x) => x.name === target);
        if (f) return f;
      }
    }
    // 2) Exakter Treffer gegen normalisierte Datenbanknamen
    const exact = FOODS.find((f) => normalizeName(f.name) === norm);
    if (exact) return exact;
    // 3) Alle Wörter der Anfrage kommen als GANZE Wörter im Datenbanknamen vor
    return FOODS.find((f) => {
      const nameTokens = normalizeName(f.name).split(/[\s\/-]+/);
      return tokens.every((t) => nameTokens.includes(t));
    }) || null;
  }

  // ---------------- Nutrition / CO2 computation ----------------
  const MAX_INGREDIENTS = 10;

  function sumTotals(list) {
    let co2 = 0, kcal = 0, fett = 0, eiweiss = 0, kh = 0, zucker = 0;
    const nutrients = {};
    NUTRIENTS.forEach((n) => { nutrients[n.key] = 0; });
    list.forEach((it) => {
      if (!it.match || it.grams <= 0) return;
      const f = it.grams / 100;
      co2 += (it.grams / 1000) * it.match.co2;
      kcal += f * it.match.kcal;
      fett += f * it.match.fett;
      eiweiss += f * it.match.eiweiss;
      kh += f * it.match.kh;
      zucker += f * (it.match.zucker || 0);
      NUTRIENTS.forEach((n) => { nutrients[n.key] += f * (it.match[n.key] || 0); });
    });
    return { co2, kcal, fett, eiweiss, kh, zucker, nutrients };
  }

  // Gramm-Zielwert pro Portion fuer 50% des Tagesbedarfs; wird VOR der
  // DeepSeek-Anfrage berechnet und dem Prompt mitgegeben, NICHT nachtraeglich
  // am Ergebnis veraendert.
  function targetGramsPerPortion(foodName, nutrientKey, isProtein) {
    const food = FOODS.find((f) => f.name === foodName);
    if (!food) return null;
    return requiredGramsForHalfDaily(food, isProtein ? "eiweiss" : nutrientKey);
  }

  // Berechnet ALLE abgeleiteten Werte eines Rezepts aus recipe.ingredients
  // (Name + Gramm). Bei Erstellung UND nach jeder manuellen Bearbeitung.
  function recomputeRecipeStats(recipe) {
    const resolved = recipe.ingredients.map((it) => ({
      name: it.name, grams: it.grams, match: findFoodMatch(it.name),
    }));
    recipe.resolvedIngredients = resolved;

    const t = sumTotals(resolved);
    recipe.co2Total = t.co2;
    recipe.co2PerPortion = t.co2 / recipe.personen;
    recipe.kcalTotal = t.kcal;
    recipe.kcalPerPortion = t.kcal / recipe.personen;
    recipe.fettTotal = t.fett;
    recipe.eiweissTotal = t.eiweiss;
    recipe.khTotal = t.kh;
    recipe.zuckerTotal = t.zucker;
    recipe.savingsKg = Math.max(0, AVERAGE_MEAL_CO2_KG * recipe.personen - t.co2);
    recipe.kmEquivalent = (recipe.savingsKg * 1000) / CAR_G_CO2_PER_KM;

    const nutrientPctPerPortion = {};
    NUTRIENTS.forEach((n) => {
      nutrientPctPerPortion[n.key] = Math.min(999, ((t.nutrients[n.key] / recipe.personen) / n.dailyRef) * 100);
    });
    recipe.nutrientTotals = t.nutrients;
    recipe.perPortion = nutrientPctPerPortion;
    recipe.proteinPctPerPortion = Math.min(999, ((t.eiweiss / recipe.personen) / EU_REF_PROTEIN_G) * 100);
    recipe.kcalPctPerPortion = Math.min(999, ((t.kcal / recipe.personen) / EU_REF_KCAL) * 100);
    recipe.fettPctPerPortion = Math.min(999, ((t.fett / recipe.personen) / EU_REF_FETT_G) * 100);
    recipe.zuckerPctPerPortion = Math.min(999, ((t.zucker / recipe.personen) / EU_REF_ZUCKER_G) * 100);

    recipe.vegan = resolved.every((it) => !it.match || animalCategory(it.match.name) === "vegan");
    recipe.vegetarisch = resolved.every((it) => !it.match || animalCategory(it.match.name) !== "tierisch");
    return recipe;
  }

  function computeRecipe(raw, personen) {
    const recipe = {
      id: "r_" + Math.random().toString(36).slice(2, 10),
      title: raw.title || "Rezept",
      beschreibung: raw.beschreibung || "",
      mahlzeit: raw.mahlzeit || state.wizard.meal,
      zutat1: state.wizard.calorieFood,
      zutat2: state.wizard.proteinFood,
      zutat3: state.wizard.nutrientFood,
      zutat4: state.wizard.zutat4 || "",
      zutat5: state.wizard.zutat5 || "",
      zubereitung: raw.zubereitung || [],
      ingredients: (raw.zutaten || []).map((z) => {
        let g = Number(z.gramm) || 0;
        const m = findFoodMatch(z.name || "");
        // Sicherheitsnetz: liefert die KI bei Eiern eine Stueckzahl (<=12)
        // statt Gramm, in Gramm umrechnen.
        if (isEggFood(m) && g > 0 && g <= 12) g = g * EGG_WEIGHT_G;
        return { name: z.name || "", grams: g };
      }).slice(0, MAX_INGREDIENTS),
      personen,
      isCustom: false,
    };
    return recomputeRecipeStats(recipe);
  }

  // Leere Rezeptkarte fuer die freie Eingabe (ohne DeepSeek-Suche), bis zu
  // MAX_INGREDIENTS Zutaten aus der Datenbank.
  function createBlankRecipe() {
    const recipe = {
      id: "r_" + Math.random().toString(36).slice(2, 10),
      title: "Eigenes Rezept",
      beschreibung: "",
      mahlzeit: state.wizard.meal,
      zutat1: null, zutat2: null, zutat3: null, zutat4: "", zutat5: "",
      zubereitung: [],
      ingredients: [{ name: "", grams: 0 }],
      personen: state.settings.personen,
      isCustom: true,
    };
    return recomputeRecipeStats(recipe);
  }

  // ---------------- Saved recipes matching ----------------
  // Ein gespeichertes Rezept wird nur dann als Ersatz für eine neue
  // DeepSeek-Anfrage angeboten, wenn zusätzlich zu Mahlzeit/Ernährungsweise
  // auch Zutat 1 (Energielieferant) UND Zutat 2 (Eiweißlieferant) mit der
  // aktuellen Auswahl übereinstimmen.
  function findMatchingSaved(mealKey, dietKey) {
    return state.saved.filter((r) => {
      if (r.mahlzeit !== mealKey) return false;
      if (r.zutat1 !== state.wizard.calorieFood) return false;
      if (r.zutat2 !== state.wizard.proteinFood) return false;
      if (dietKey === "vegan_nur" && !r.vegan) return false;
      if (dietKey === "vegetarisch_nur" && !r.vegetarisch) return false;
      return true;
    });
  }

  // ---------------- DeepSeek prompt & call ----------------
  function buildPrompt(neededCount, alreadyChosenTitles) {
    const mealLabel = MEAL_TYPES.find((m) => m.key === state.wizard.meal).label;
    const nutrientMeta = NUTRIENTS.find((n) => n.key === state.wizard.nutrientKey);
    const dietLabel = DIET_MODES.find((d) => d.key === state.settings.diet).label;
    const weeklyLines = NUTRIENTS.map((n) => "- " + n.label + ": " + (n.dailyRef * 7) + " " + n.unit + " / Woche (Richtwert)").join("\n");

    // Konkrete Gramm-Zielwerte für Zutat 2 & 3, damit DeepSeek GEZIELT nach
    // Rezepten mit passenden Mengenverhältnissen sucht, statt dass die App
    // das Ergebnis nachträglich korrigiert.
    const proteinTargetG = state.wizard.proteinFood ? targetGramsPerPortion(state.wizard.proteinFood, "eiweiss", true) : null;
    const nutrientTargetG = state.wizard.nutrientFood ? targetGramsPerPortion(state.wizard.nutrientFood, state.wizard.nutrientKey, false) : null;
    let proteinTargetLine;
    if (!state.wizard.proteinFood) {
      proteinTargetLine = "";
    } else if (proteinTargetG) {
      proteinTargetLine = "- Zutat 2, Eiweißlieferant \"" + state.wizard.proteinFood + "\": plane pro PORTION (pro Person) mit ca. " + Math.round(proteinTargetG) + " g dieser Zutat — das deckt bei diesem Lebensmittel allein schon ca. 50% des Tagesbedarfs an Eiweiß (Referenz: " + EU_REF_PROTEIN_G + " g/Tag). Mehr ist in Ordnung, deutlich weniger nicht.\n";
    } else {
      proteinTargetLine = "- Zutat 2, Eiweißlieferant mit niedrigem CO2-Fußabdruck: \"" + state.wizard.proteinFood + "\"\n";
    }
    let nutrientTargetLine;
    if (!state.wizard.nutrientFood) {
      nutrientTargetLine = "";
    } else if (nutrientTargetG) {
      nutrientTargetLine = "- Zutat 3, " + nutrientMeta.label + "-Lieferant \"" + state.wizard.nutrientFood + "\": plane pro PORTION (pro Person) mit ca. " + Math.round(nutrientTargetG) + " g dieser Zutat — das deckt bei diesem Lebensmittel allein schon ca. 50% des Tagesbedarfs an " + nutrientMeta.label + " (Referenz: " + nutrientMeta.dailyRef + " " + nutrientMeta.unit + "/Tag). Mehr ist in Ordnung, deutlich weniger nicht.\n";
    } else {
      nutrientTargetLine = "- Zutat 3, guter Lieferant für " + nutrientMeta.label + " mit niedrigem CO2-Fußabdruck: \"" + state.wizard.nutrientFood + "\"\n";
    }
    const zutat4Line = state.wizard.zutat4 && state.wizard.zutat4.trim()
      ? "- Zutat 4 (frei gewählt): \"" + state.wizard.zutat4.trim() + "\"\n" : "";
    const zutat5Line = state.wizard.zutat5 && state.wizard.zutat5.trim()
      ? "- Zutat 5 (frei gewählt): \"" + state.wizard.zutat5.trim() + "\"\n" : "";

    return "Du bist ein Ernährungs- und Kochexperte, spezialisiert auf klimafreundliche, alltagstaugliche Küche in Deutschland.\n\n" +
      "AUFGABE: Erstelle " + neededCount + " unterschiedliche Rezepte für die Mahlzeit \"" + mealLabel + "\", für genau " + state.settings.personen + " Person(en) pro Rezept (Mengenangaben in Gramm für " + state.settings.personen + " Person(en) insgesamt).\n\n" +
      "ERNÄHRUNGSWEISE: " + dietLabel + (state.settings.diet.endsWith("_nur") ? " (zwingend einhalten)." : " (falls 'bevorzugt': wenn möglich einhalten, ist aber keine harte Vorgabe).") + "\n\n" +
      "WICHTIGE ZUTATEN MIT MENGENVORGABEN (bitte einbauen, exakte Bezeichnung beibehalten; die Gramm-Angaben sind eine GEZIELTE Vorgabe für die Rezeptsuche, kein grober Richtwert — suche/entwerfe Rezepte, die diese Mengen bereits von sich aus enthalten; fehlende Zutaten unten wurden bewusst nicht vorgegeben, dann frei ergänzen):\n" +
      "- Zutat 1, Energielieferant mit niedrigem CO2-Fußabdruck: \"" + state.wizard.calorieFood + "\" (Menge nach Rezeptbedarf).\n" +
      proteinTargetLine +
      nutrientTargetLine +
      zutat4Line +
      zutat5Line + "\n" +
      "WEITERE VORLIEBEN/UNVERTRÄGLICHKEITEN DES NUTZERS (unbedingt beachten): " + (state.settings.freitext || "keine besonderen Angaben") + "\n\n" +
      "PORTIONSGRÖSSE: mindestens 400, höchstens 800 kcal pro Person und Mahlzeit (800 kcal ist eine harte Obergrenze, nicht überschreiten).\n" +
      "MENGEN: Verwende ausschließlich übliche, im Haushalt realistische Zutatenmengen (wie in einem normalen Kochrezept für " + state.settings.personen + " Person(en)) — keine ungewöhnlich großen oder kleinen Mengen, auch nicht um die Mengenvorgaben zu Zutat 2/3 zu erfüllen. Mengen IMMER in Gramm angeben, auch bei Eiern (1 Ei ≈ 58 g, also 2 Eier = 116 g).\n" +
      "OBERGRENZEN PRO PORTION (nicht überschreiten): Fett ca. " + MEAL_MAX.fettG + " g, Zucker ca. " + MEAL_MAX.zuckerG + " g, Salz ca. " + MEAL_MAX.salzG + " g.\n\n" +
      "ZIEL FÜR DIE GESAMTHEIT ALLER " + RECIPE_COUNT + " REZEPTE EINER ANFRAGE (nicht nur dieses eine): zusammen mindestens den folgenden wöchentlichen Bedarf an lebensnotwendigen Vitaminen/Mineralstoffen eines durchschnittlichen Erwachsenen decken (grobe Richtwerte, D-A-CH/DGE-Orientierung):\n" +
      weeklyLines + "\n" +
      "Wähle die Zutaten so, dass unterschiedliche Rezepte unterschiedliche Nährstoffe abdecken (Abwechslung).\n" +
      (alreadyChosenTitles && alreadyChosenTitles.length ? "\nBEREITS AUSGEWÄHLTE REZEPTE (nicht wiederholen, aber bei der Nährstoff-Abdeckung mitdenken): " + alreadyChosenTitles.join("; ") + "\n" : "") +
      "\nWICHTIG ZU ZUTATEN-NAMEN: Verwende für Zutaten möglichst einfache, gängige deutsche Bezeichnungen (z.B. \"Zwiebeln\", \"Tomaten\", \"Kartoffeln\", \"Haferflocken\"), keine Markennamen, keine ausgefallenen Spezialzutaten. Gewürze/Kräuter dürfen zum Würzen verwendet werden, zählen aber nicht als Hauptzutat.\n\n" +
      "ANTWORTFORMAT: Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Fließtext davor/danach) exakt in dieser Struktur:\n" +
      '{"rezepte": [{"title": "Name des Gerichts", "beschreibung": "1-2 Sätze Beschreibung", "zutaten": [{"name": "Zutat", "gramm": 200}], "zubereitung": ["Schritt 1...", "Schritt 2..."]}]}';
  }

  async function callDeepSeek(prompt) {
    const url = "https://api.deepseek.com/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.settings.apiKey,
      },
      body: JSON.stringify({
        model: state.settings.model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error("DeepSeek-Anfrage fehlgeschlagen (Status " + res.status + "). " + text.slice(0, 200));
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error("DeepSeek hat keine verwertbare Antwort geliefert.");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Antwort von DeepSeek konnte nicht als JSON gelesen werden.");
      parsed = JSON.parse(match[0]);
    }
    return parsed.rezepte || parsed.recipes || [];
  }

  // ---------------- Generate flow ----------------
  async function handleGenerate() {
    if (!state.settings.apiKey) {
      alert("Bitte hinterlege zuerst deinen DeepSeek-API-Key in den Grundeinstellungen (Zahnrad oben rechts).");
      showView("settings");
      return;
    }
    showView("loading");
    q("loading-text").textContent = "Prüfe gespeicherte Rezepte…";

    const matchingSaved = findMatchingSaved(state.wizard.meal, state.settings.diet);
    const reuse = matchingSaved.slice(0, RECIPE_COUNT);
    const neededCount = Math.max(0, RECIPE_COUNT - reuse.length);

    let generated = [];
    try {
      if (neededCount > 0) {
        q("loading-text").textContent = "Frage DeepSeek nach " + neededCount + " klimafreundlichen Rezept(en)…";
        const prompt = buildPrompt(neededCount, reuse.map((r) => r.title));
        const raw = await callDeepSeek(prompt);
        generated = raw.map((r) => computeRecipe(r, state.settings.personen));
      }
    } catch (err) {
      showView("wizard");
      alert("Fehler beim Abruf von DeepSeek:\n\n" + err.message +
        "\n\nHäufigste Ursache: CORS-Blockierung durch den Browser, da die DeepSeek-API für Server-zu-Server-Aufrufe gedacht ist. " +
        "Siehe README für Details und einen möglichen Workaround (kleiner Proxy).");
      return;
    }

    state.results = reuse.concat(generated).slice(0, RECIPE_COUNT);
    renderResults();
    showView("results");
  }

  // ---------------- Rendering: results & saved ----------------
  function nutrientBarClass(pct) {
    if (pct >= 50) return "";
    if (pct >= 20) return "mid";
    return "low";
  }

  function persistIfSaved(recipe) {
    const idx = state.saved.findIndex((r) => r.id === recipe.id);
    if (idx > -1) { state.saved[idx] = recipe; persistSaved(); }
  }

  function renderIngredientRows(node, recipe) {
    const box = node.querySelector(".ingredient-editor");
    box.innerHTML = "";
    recipe.ingredients.forEach((ing, idx) => {
      const match = findFoodMatch(ing.name);
      const row = document.createElement("div");
      row.className = "ingredient-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "text-input ingredient-name";
      nameInput.setAttribute("list", "datalist-all-foods");
      nameInput.placeholder = "Zutat suchen…";
      nameInput.value = ing.name;
      if (!match && ing.name) nameInput.classList.add("no-match");

      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0";
      qtyInput.step = "any";
      qtyInput.className = "text-input ingredient-qty";
      qtyInput.value = ing.grams ? (match ? displayValueFromGrams(match, ing.grams) : ing.grams) : "";

      const unitSpan = document.createElement("span");
      unitSpan.className = "ingredient-unit";
      unitSpan.textContent = match ? displayUnitFor(match) : "g";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "ingredient-remove";
      removeBtn.setAttribute("aria-label", "Zutat entfernen");
      removeBtn.textContent = "×";

      function applyChange() {
        const newMatch = findFoodMatch(nameInput.value);
        const rawQty = parseFloat(qtyInput.value) || 0;
        ing.name = nameInput.value;
        ing.grams = newMatch ? gramsFromDisplayValue(newMatch, rawQty) : rawQty;
        nameInput.classList.toggle("no-match", !newMatch && !!nameInput.value);
        unitSpan.textContent = newMatch ? displayUnitFor(newMatch) : "g";
        recomputeRecipeStats(recipe);
        refreshCardComputedParts(node, recipe);
        persistIfSaved(recipe);
      }
      nameInput.addEventListener("change", applyChange);
      qtyInput.addEventListener("input", applyChange);
      removeBtn.addEventListener("click", () => {
        recipe.ingredients.splice(idx, 1);
        recomputeRecipeStats(recipe);
        renderIngredientRows(node, recipe);
        refreshCardComputedParts(node, recipe);
        persistIfSaved(recipe);
      });

      row.appendChild(nameInput);
      row.appendChild(qtyInput);
      row.appendChild(unitSpan);
      row.appendChild(removeBtn);
      box.appendChild(row);
    });

    node.querySelector(".add-ingredient-btn").hidden = recipe.ingredients.length >= MAX_INGREDIENTS;
  }

  function addBarRow(box, label, pct, valueText) {
    const p = Math.min(100, pct);
    const row = document.createElement("div");
    row.className = "nbar-row";
    row.innerHTML = "<span>" + label + "</span><span class=\"nbar-track\"><span class=\"nbar-fill " +
      nutrientBarClass(p) + "\" style=\"width:" + p + "%\"></span></span><span>" + valueText + "</span>";
    box.appendChild(row);
  }

  function refreshCardComputedParts(node, recipe) {
    node.querySelector(".card-portions").textContent = recipe.personen;
    node.querySelector(".stat-savings-kg").textContent =
      (recipe.savingsKg > 0 ? "+" : "") + recipe.savingsKg.toFixed(2) + " kg CO2e";
    node.querySelector(".stat-savings-km").textContent = recipe.savingsKg > 0
      ? "≈ " + recipe.kmEquivalent.toFixed(1) + " Auto-km eingespart"
      : "keine Einsparung ggü. Durchschnitt";

    const box = node.querySelector(".nutrient-bars");
    box.innerHTML = "";
    const p = recipe.personen;
    addBarRow(box, "Kcal", recipe.kcalPctPerPortion, Math.round(recipe.kcalTotal / p) + "/" + EU_REF_KCAL);
    addBarRow(box, "Protein", recipe.proteinPctPerPortion, (recipe.eiweissTotal / p).toFixed(0) + "/" + EU_REF_PROTEIN_G + " g");
    addBarRow(box, "Fett", recipe.fettPctPerPortion, (recipe.fettTotal / p).toFixed(0) + "/" + EU_REF_FETT_G + " g");
    addBarRow(box, "Zucker", recipe.zuckerPctPerPortion, (recipe.zuckerTotal / p).toFixed(0) + "/" + EU_REF_ZUCKER_G + " g");
    NUTRIENTS.forEach((n) => {
      addBarRow(box, n.label, recipe.perPortion[n.key], Math.round(recipe.perPortion[n.key]) + "%");
    });
  }

  function buildCardNode(recipe) {
    const tpl = q("tpl-recipe-card");
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = recipe.id;

    const mealMeta = MEAL_TYPES.find((m) => m.key === recipe.mahlzeit);
    node.querySelector(".meal-tag").textContent = mealMeta ? mealMeta.label : recipe.mahlzeit;

    const titleInput = node.querySelector(".card-title-input");
    titleInput.value = recipe.title;
    titleInput.addEventListener("change", (e) => { recipe.title = e.target.value; persistIfSaved(recipe); });

    node.querySelector(".card-desc").textContent = recipe.beschreibung || "";

    const stepsList = node.querySelector(".steps-list");
    const stepsEditor = node.querySelector(".steps-editor");
    if (recipe.isCustom) {
      stepsList.hidden = true;
      stepsEditor.hidden = false;
      stepsEditor.value = (recipe.zubereitung || []).join("\n");
      stepsEditor.addEventListener("change", (e) => {
        recipe.zubereitung = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
        persistIfSaved(recipe);
      });
    } else {
      (recipe.zubereitung || []).forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        stepsList.appendChild(li);
      });
    }

    renderIngredientRows(node, recipe);
    node.querySelector(".add-ingredient-btn").addEventListener("click", () => {
      if (recipe.ingredients.length >= MAX_INGREDIENTS) return;
      recipe.ingredients.push({ name: "", grams: 0 });
      recomputeRecipeStats(recipe);
      renderIngredientRows(node, recipe);
      refreshCardComputedParts(node, recipe);
    });

    refreshCardComputedParts(node, recipe);

    const saveBtn = node.querySelector(".save-btn");
    const isSaved = state.saved.some((r) => r.id === recipe.id);
    if (isSaved) { saveBtn.textContent = "♥"; saveBtn.classList.add("is-saved"); }
    saveBtn.addEventListener("click", () => toggleSave(recipe, saveBtn));

    node.querySelector(".export-btn").addEventListener("click", () => exportSingleCard(node));

    return node;
  }

  function renderResults() {
    const grid = q("results-grid");
    grid.innerHTML = "";
    state.results.forEach((r) => grid.appendChild(buildCardNode(r)));
    const co2Sum = state.results.reduce((s, r) => s + r.co2Total, 0);
    const savingsSum = state.results.reduce((s, r) => s + r.savingsKg, 0);
    q("results-summary").textContent =
      state.results.length + " Rezepte für je " + state.settings.personen + " Person(en) — zusammen " + co2Sum.toFixed(1) + " kg CO2e, " +
      savingsSum.toFixed(1) + " kg CO2e gespart ggü. Durchschnitts-Mischkost (≈ " + ((savingsSum * 1000) / CAR_G_CO2_PER_KM).toFixed(0) + " Auto-km).";
  }

  function renderSaved() {
    const grid = q("saved-grid");
    grid.innerHTML = "";
    q("saved-empty").hidden = state.saved.length > 0;
    state.saved.forEach((r) => grid.appendChild(buildCardNode(r)));
  }

  function toggleSave(recipe, btnEl) {
    const idx = state.saved.findIndex((r) => r.id === recipe.id);
    if (idx > -1) {
      state.saved.splice(idx, 1);
      btnEl.textContent = "♡";
      btnEl.classList.remove("is-saved");
    } else {
      state.saved.push(recipe);
      btnEl.textContent = "♥";
      btnEl.classList.add("is-saved");
      pushLast3(recipe);
    }
    persistSaved();
  }

  // ---------------- PDF export ----------------
  function exportAll() { window.print(); }

  function exportSingleCard(cardNode) {
    const grid = cardNode.parentElement;
    grid.classList.add("print-only-single");
    cardNode.classList.add("is-printing");
    window.print();
    setTimeout(() => {
      grid.classList.remove("print-only-single");
      cardNode.classList.remove("is-printing");
    }, 500);
  }

  // ---------------- Progress chart ----------------
  function renderProgress() {
    const last3 = getLast3();
    const box = q("progress-chart");
    box.innerHTML = "";
    q("progress-empty").hidden = last3.length > 0;
    if (!last3.length) return;

    NUTRIENTS.forEach((n) => {
      const sumPct = Math.min(100, last3.reduce((s, r) => s + (r.perPortion ? (r.perPortion[n.key] || 0) : 0), 0));
      const row = document.createElement("div");
      row.className = "pbar-row";
      row.innerHTML = "<span>" + n.label + "</span><span class=\"pbar-track\"><span class=\"pbar-fill " + nutrientBarClass(sumPct) + "\" style=\"width:" + sumPct + "%\"></span></span><span class=\"pbar-pct\">" + Math.round(sumPct) + "%</span>";
      box.appendChild(row);
    });
  }

  // ---------------- Init ----------------
  function wireNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.view));
    });
    q("settings-btn").addEventListener("click", () => showView("settings"));
  }

  async function init() {
    showView("loading");
    q("loading-text").textContent = "Lade Lebensmitteldatenbank aus CO2-Rucksack-Lebensmittel.xlsx…";
    try {
      await loadFoodsFromExcel();
    } catch (err) {
      q("loading-text").textContent =
        "Fehler beim Laden der Lebensmitteldatenbank: " + err.message +
        " Bitte Seite neu laden, sobald das Problem behoben ist.";
      return; // App ohne Datenbank nicht sinnvoll nutzbar
    }

    loadSettings();
    loadSaved();

    renderDietChips();
    fillSettingsForm();
    renderMealChips();
    populateCalorieDropdown();
    populateProteinDropdown();
    populateNutrientTypeDropdown();
    populateNutrientSourceDropdown();
    populateFreeZutatDatalists();
    populateZutatDatalist("datalist-all-foods", allFoodsAlphabetical());
    updateSavedHint();
    wireNav();

    q("save-settings-btn").addEventListener("click", saveSettingsFromForm);
    q("sel-calorie").addEventListener("change", (e) => { state.wizard.calorieFood = e.target.value; });
    q("sel-protein").addEventListener("change", (e) => {
      state.wizard.proteinFood = e.target.value === NONE_VALUE ? null : e.target.value;
    });
    q("sel-nutrient-type").addEventListener("change", (e) => {
      state.wizard.nutrientKey = e.target.value;
      populateNutrientSourceDropdown();
    });
    q("sel-nutrient-source").addEventListener("change", (e) => {
      state.wizard.nutrientFood = e.target.value === NONE_VALUE ? null : e.target.value;
    });
    q("inp-zutat4").addEventListener("input", (e) => updateFreeZutat("zutat4", e.target.value));
    q("inp-zutat5").addEventListener("input", (e) => updateFreeZutat("zutat5", e.target.value));
    q("generate-btn").addEventListener("click", handleGenerate);
    q("export-all-btn").addEventListener("click", exportAll);
    q("add-custom-recipe-btn").addEventListener("click", () => {
      const blank = createBlankRecipe();
      state.results.push(blank);
      renderResults();
      const node = document.querySelector('.recipe-card[data-id="' + blank.id + '"]');
      if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    document.getElementById("app-version").textContent = "v" + APP_VERSION;

    if (!state.settings.apiKey) {
      showView("settings");
    } else {
      showView("wizard");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
