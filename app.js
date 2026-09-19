/* ============================================================
   Klima-Rezepte — App-Logik
   ============================================================ */

(function () {
  "use strict";

  const APP_VERSION = "0.3";
  const LS_SETTINGS = "klimarezepte:settings:v1";
  const LS_SAVED = "klimarezepte:saved:v1";
  const LS_LAST3 = "klimarezepte:last3:v1";

  // ---------------- State ----------------
  const state = {
    settings: { personen: 2, diet: "keine", freitext: "", apiKey: "", model: "deepseek-chat" },
    wizard: { meal: "mittagessen", calorieFood: null, proteinFood: null, nutrientKey: NUTRIENTS[0].key, nutrientFood: null },
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
    sel.innerHTML = "";
    list.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.food.name;
      opt.textContent = foodOptionLabel(entry, "kcal");
      sel.appendChild(opt);
    });
    state.wizard.calorieFood = list.length ? list[0].food.name : null;
  }

  function populateProteinDropdown() {
    const sel = q("sel-protein");
    const list = sortedProteinSources().filter((x) => allowedByDiet(x.food.name, state.settings.diet) && isMainFood(x.food));
    sel.innerHTML = "";
    list.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.food.name;
      opt.textContent = foodOptionLabel(entry, "g Eiweiß");
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
    sel.innerHTML = "";
    list.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.food.name;
      opt.textContent = foodOptionLabel(entry, meta.unit + " " + meta.label);
      sel.appendChild(opt);
    });
    state.wizard.nutrientFood = list.length ? list[0].food.name : null;
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
  const MATCH_ALIASES = {
    "zwiebel": "Zwiebeln", "tomate": "Tomaten (regional, unbeheizter Folientunnel)",
    "tomaten": "Tomaten (regional, unbeheizter Folientunnel)",
    "kartoffel": "Kartoffeln (roh)", "möhre": "Karotten", "möhren": "Karotten", "karotte": "Karotten",
    "paprika": "Paprika (rot)", "olivenöl": null, "vollkornnudeln": "Nudeln (Vollkorn, trocken)",
    "spaghetti": "Nudeln (Vollkorn, trocken)", "nudeln": "Nudeln (Vollkorn, trocken)",
    "haferflocken": "Haferflocken", "milch": "Kuhmilch", "ei": "Eier", "eier": "Eier",
    "käse": "Käse (Hartkäse)", "parmesan": "Käse (Hartkäse)", "tofu": "Tofu",
    "linsen": "Linsen (trocken)", "erbsen": "Erbsen (TK, gegart)", "mais": "Mais (Zuckermais, TK/Dose)",
    "reis": "Reis (roh)", "apfel": "Äpfel", "äpfel": "Äpfel", "banane": "Bananen", "bananen": "Bananen",
    "orange": "Orangen", "weißkohl": "Weißkohl (Freiland, Deutschland)", "eisbergsalat": "Eissalat (Freiland, Deutschland)",
    "salat": "Eissalat (Freiland, Deutschland)", "brokkoli": "Brokkoli", "erdnüsse": "Erdnüsse",
    "mandeln": "Mandeln", "rapsöl": "Rapsöl", "sojamilch": "Sojamilch", "zucker": "Zucker (Rübenzucker)",
  };

  function normalizeName(s) {
    return s.toLowerCase().trim()
      .replace(/\(.*?\)/g, "")
      .replace(/[.,;].*$/, "")
      .trim();
  }

  function findFoodMatch(ingredientName) {
    const norm = normalizeName(ingredientName);
    let hit = FOODS.find((f) => normalizeName(f.name) === norm);
    if (hit) return hit;
    for (const key in MATCH_ALIASES) {
      if (norm === key || norm.includes(key)) {
        const target = MATCH_ALIASES[key];
        if (target === null) return null;
        const f = FOODS.find((x) => x.name === target);
        if (f) return f;
      }
    }
    hit = FOODS.find((f) => normalizeName(f.name).includes(norm) || norm.includes(normalizeName(f.name)));
    return hit || null;
  }

  // ---------------- Nutrition / CO2 computation for a generated recipe ----------------
  function sumTotals(list) {
    let co2 = 0, kcal = 0, fett = 0, eiweiss = 0, kh = 0;
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
      NUTRIENTS.forEach((n) => { nutrients[n.key] += f * (it.match[n.key] || 0); });
    });
    return { co2, kcal, fett, eiweiss, kh, nutrients };
  }

  // Gramm-Zielwert, den eine Zutat pro PORTION erreichen müsste, um allein
  // 50% des Tagesbedarfs von Eiweiß bzw. des gewählten Nährstoffs zu
  // decken. Wird VOR der DeepSeek-Anfrage berechnet und der KI als
  // konkrete Zahl mitgegeben (gezielte Rezeptsuche), NICHT nachträglich
  // am Ergebnis verändert.
  function targetGramsPerPortion(foodName, nutrientKey, isProtein) {
    const food = FOODS.find((f) => f.name === foodName);
    if (!food) return null;
    const dailyRef = isProtein ? EU_REF_PROTEIN_G : NUTRIENTS.find((n) => n.key === nutrientKey).dailyRef;
    const perGram = isProtein ? food.eiweiss / 100 : (food[nutrientKey] || 0) / 100;
    if (!perGram) return null;
    return (0.5 * dailyRef) / perGram;
  }

  function computeRecipe(raw, personen) {
    const resolved = (raw.zutaten || []).map((z) => ({
      name: z.name || "", grams: Number(z.gramm) || 0, match: findFoodMatch(z.name || ""),
    }));

    const t = sumTotals(resolved);
    const ingredientLines = resolved.map((it) => ({
      text: (it.grams ? it.grams + " g " : "") + it.name,
      matched: !!it.match,
    }));

    const co2PerPortion = t.co2 / personen;
    const kcalPerPortion = t.kcal / personen;
    const savingsKg = Math.max(0, AVERAGE_MEAL_CO2_KG * personen - t.co2);
    const kmEquivalent = (savingsKg * 1000) / CAR_G_CO2_PER_KM;

    const nutrientPctPerPortion = {};
    NUTRIENTS.forEach((n) => {
      nutrientPctPerPortion[n.key] = Math.min(999, ((t.nutrients[n.key] / personen) / n.dailyRef) * 100);
    });
    const proteinPctPerPortion = Math.min(999, ((t.eiweiss / personen) / EU_REF_PROTEIN_G) * 100);

    return {
      id: "r_" + Math.random().toString(36).slice(2, 10),
      title: raw.title || "Rezept",
      beschreibung: raw.beschreibung || "",
      mahlzeit: raw.mahlzeit || state.wizard.meal,
      zutat1: state.wizard.calorieFood,
      zutat2: state.wizard.proteinFood,
      zutat3: state.wizard.nutrientFood,
      zubereitung: raw.zubereitung || [],
      ingredientLines,
      personen,
      co2Total: t.co2, co2PerPortion: co2PerPortion, kcalTotal: t.kcal, kcalPerPortion: kcalPerPortion,
      fettTotal: t.fett, eiweissTotal: t.eiweiss, khTotal: t.kh,
      proteinPctPerPortion: proteinPctPerPortion,
      savingsKg: savingsKg, kmEquivalent: kmEquivalent,
      nutrientTotals: t.nutrients, perPortion: nutrientPctPerPortion,
      vegan: resolved.every((it) => !it.match || animalCategory(it.match.name) === "vegan"),
      vegetarisch: resolved.every((it) => !it.match || animalCategory(it.match.name) !== "tierisch"),
    };
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
    const proteinTargetG = targetGramsPerPortion(state.wizard.proteinFood, "eiweiss", true);
    const nutrientTargetG = targetGramsPerPortion(state.wizard.nutrientFood, state.wizard.nutrientKey, false);
    const proteinTargetLine = proteinTargetG
      ? "- Zutat 2, Eiweißlieferant \"" + state.wizard.proteinFood + "\": plane pro PORTION (pro Person) mit ca. " + Math.round(proteinTargetG) + " g dieser Zutat — das deckt bei diesem Lebensmittel allein schon ca. 50% des Tagesbedarfs an Eiweiß (Referenz: " + EU_REF_PROTEIN_G + " g/Tag). Mehr ist in Ordnung, deutlich weniger nicht.\n"
      : "- Zutat 2, Eiweißlieferant mit niedrigem CO2-Fußabdruck: \"" + state.wizard.proteinFood + "\"\n";
    const nutrientTargetLine = nutrientTargetG
      ? "- Zutat 3, " + nutrientMeta.label + "-Lieferant \"" + state.wizard.nutrientFood + "\": plane pro PORTION (pro Person) mit ca. " + Math.round(nutrientTargetG) + " g dieser Zutat — das deckt bei diesem Lebensmittel allein schon ca. 50% des Tagesbedarfs an " + nutrientMeta.label + " (Referenz: " + nutrientMeta.dailyRef + " " + nutrientMeta.unit + "/Tag). Mehr ist in Ordnung, deutlich weniger nicht.\n"
      : "- Zutat 3, guter Lieferant für " + nutrientMeta.label + " mit niedrigem CO2-Fußabdruck: \"" + state.wizard.nutrientFood + "\"\n";

    return "Du bist ein Ernährungs- und Kochexperte, spezialisiert auf klimafreundliche, alltagstaugliche Küche in Deutschland.\n\n" +
      "AUFGABE: Erstelle " + neededCount + " unterschiedliche Rezepte für die Mahlzeit \"" + mealLabel + "\", für genau " + state.settings.personen + " Person(en) pro Rezept (Mengenangaben in Gramm für " + state.settings.personen + " Person(en) insgesamt).\n\n" +
      "ERNÄHRUNGSWEISE: " + dietLabel + (state.settings.diet.endsWith("_nur") ? " (zwingend einhalten)." : " (falls 'bevorzugt': wenn möglich einhalten, ist aber keine harte Vorgabe).") + "\n\n" +
      "WICHTIGE ZUTATEN MIT MENGENVORGABEN (bitte in jedem Rezept einbauen, exakte Bezeichnung beibehalten; die Gramm-Angaben unten sind eine GEZIELTE Vorgabe für die Rezeptsuche, kein grober Richtwert — suche/entwerfe Rezepte, die diese Mengen bereits von sich aus enthalten):\n" +
      "- Zutat 1, Energielieferant mit niedrigem CO2-Fußabdruck: \"" + state.wizard.calorieFood + "\" (Menge nach Rezeptbedarf).\n" +
      proteinTargetLine +
      nutrientTargetLine + "\n" +
      "WEITERE VORLIEBEN/UNVERTRÄGLICHKEITEN DES NUTZERS (unbedingt beachten): " + (state.settings.freitext || "keine besonderen Angaben") + "\n\n" +
      "PORTIONSGRÖSSE: 400-1000 kcal pro Person und Mahlzeit.\n" +
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

  function buildCardNode(recipe) {
    const tpl = q("tpl-recipe-card");
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = recipe.id;

    const mealMeta = MEAL_TYPES.find((m) => m.key === recipe.mahlzeit);
    node.querySelector(".meal-tag").textContent = mealMeta ? mealMeta.label : recipe.mahlzeit;
    node.querySelector(".card-title").textContent = recipe.title;
    node.querySelector(".card-desc").textContent = recipe.beschreibung || "";
    node.querySelector(".card-portions").textContent = recipe.personen;

    node.querySelector(".stat-kcal").textContent = Math.round(recipe.kcalPerPortion) + " kcal";
    node.querySelector(".stat-co2").textContent = recipe.co2PerPortion.toFixed(2) + " kg";
    node.querySelector(".stat-co2total").textContent = recipe.co2Total.toFixed(2) + " kg";
    node.querySelector(".stat-savings").textContent = recipe.savingsKg > 0
      ? "≈ " + recipe.kmEquivalent.toFixed(1) + " Auto-km"
      : "–";

    const ingList = node.querySelector(".ingredient-list");
    recipe.ingredientLines.forEach((l) => {
      const li = document.createElement("li");
      li.textContent = l.text + (l.matched ? "" : " (nicht in CO2-Datenbank erfasst)");
      if (!l.matched) li.className = "no-match";
      ingList.appendChild(li);
    });

    const stepsList = node.querySelector(".steps-list");
    (recipe.zubereitung || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      stepsList.appendChild(li);
    });

    const barsBox = node.querySelector(".nutrient-bars");
    NUTRIENTS.forEach((n) => {
      const pct = Math.min(100, recipe.perPortion[n.key]);
      const row = document.createElement("div");
      row.className = "nbar-row";
      row.innerHTML = "<span>" + n.label + "</span><span class=\"nbar-track\"><span class=\"nbar-fill " + nutrientBarClass(pct) + "\" style=\"width:" + pct + "%\"></span></span><span>" + Math.round(recipe.perPortion[n.key]) + "%</span>";
      barsBox.appendChild(row);
    });

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
    updateSavedHint();
    wireNav();

    q("save-settings-btn").addEventListener("click", saveSettingsFromForm);
    q("sel-calorie").addEventListener("change", (e) => { state.wizard.calorieFood = e.target.value; });
    q("sel-protein").addEventListener("change", (e) => { state.wizard.proteinFood = e.target.value; });
    q("sel-nutrient-type").addEventListener("change", (e) => {
      state.wizard.nutrientKey = e.target.value;
      populateNutrientSourceDropdown();
    });
    q("sel-nutrient-source").addEventListener("change", (e) => { state.wizard.nutrientFood = e.target.value; });
    q("generate-btn").addEventListener("click", handleGenerate);
    q("export-all-btn").addEventListener("click", exportAll);

    document.getElementById("app-version").textContent = "v" + APP_VERSION;

    if (!state.settings.apiKey) {
      showView("settings");
    } else {
      showView("wizard");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
