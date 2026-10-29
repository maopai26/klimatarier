/* ============================================================
   Klima-Rezepte — Lebensmittel- und Referenzwert-Datenbank
   Basis: CO2-Rucksack-Lebensmittel.xlsx — 420 Lebensmittel (177 direkt aus
   ifeu 2020/HLNUG, 8 aus fruehere ifeu/Poore&Nemecek/Thuenen-Recherche,
   235 systematisch geschaetzt, siehe Excel-Methodikblatt). Nährwerte je
   100 g. Stand: 14.09.2026.
   ============================================================ */


/* FOODS wird nicht mehr statisch eingebettet, sondern zur Laufzeit direkt
   aus der Excel-Datei "CO2-Rucksack-Lebensmittel.xlsx" gelesen (siehe
   loadFoodsFromExcel() unten) — dadurch kannst du die Excel-Datei manuell
   bearbeiten (Werte ändern, Zeilen hinzufügen) und die App übernimmt das
   beim nächsten Laden automatisch, ohne dass der Code angepasst werden
   muss. Reihenfolge der Spalten im Blatt "Rohdaten" ist unten fest codiert
   (siehe EXCEL_NUTRIENT_COLUMN_ORDER) und muss zur Excel-Struktur passen. */
let FOODS = [];

const EXCEL_FILE = "CO2-Rucksack-Lebensmittel.xlsx";
const EXCEL_SHEET = "Rohdaten";
// 0-basierte Spaltenindizes im Blatt "Rohdaten":
// A=0 Lebensmittel, B=1 Quelle, C=2 CO2 DE/Basis, D=3 CO2 global,
// E=4 Saison, F=5 Hinweis, G=6 kcal, H=7 Fett, I=8 Eiweiß, J=9 KH,
// K..Z=10..25 die 16 Nährstoffe in dieser Reihenfolge, AA=26 Zucker:
const EXCEL_NUTRIENT_COLUMN_ORDER = [
  "vitA", "vitC", "vitD", "vitE", "vitK", "b1", "b2", "niacin",
  "b6", "folat", "b12", "ca", "fe", "mg", "zn", "k",
];
const EXCEL_ZUCKER_COLUMN = 26; // Spalte AA

async function loadFoodsFromExcel() {
  const res = await fetch(EXCEL_FILE);
  if (!res.ok) {
    throw new Error(
      "Die Excel-Datei '" + EXCEL_FILE + "' konnte nicht geladen werden (Status " + res.status + "). " +
      "Liegt sie im selben Ordner wie index.html? Läuft die Seite über einen echten Webserver " +
      "(nicht per Doppelklick als Datei geöffnet)?"
    );
  }
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[EXCEL_SHEET];
  if (!sheet) {
    throw new Error("Im Arbeitsblatt wurde kein Blatt namens '" + EXCEL_SHEET + "' gefunden.");
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: 0, blankrows: false });

  const parsed = [];
  for (let i = 1; i < rows.length; i++) { // Zeile 0 = Kopfzeile
    const r = rows[i];
    if (!r || !r[0]) continue;
    const food = {
      name: String(r[0]).trim(),
      source: r[1] ? String(r[1]) : "",
      co2: Number(r[2]) || 0,
      season: r[4] ? String(r[4]) : "",
      kcal: Number(r[6]) || 0,
      fett: Number(r[7]) || 0,
      eiweiss: Number(r[8]) || 0,
      kh: Number(r[9]) || 0,
      zucker: Number(r[EXCEL_ZUCKER_COLUMN]) || 0,
    };
    EXCEL_NUTRIENT_COLUMN_ORDER.forEach((key, idx) => {
      food[key] = Number(r[10 + idx]) || 0;
    });
    parsed.push(food);
  }
  if (!parsed.length) {
    throw new Error("Es wurden keine gültigen Lebensmittel-Zeilen in der Excel-Datei gefunden.");
  }
  FOODS = parsed;
  return FOODS;
}

/* ---------------- Nährstoff-Metadaten ----------------
   key muss zu einem Feld in FOODS passen. unit = wie in den Rohdaten
   hinterlegt (mg oder µg je 100g). dailyRef = DGE/D-A-CH-Referenzwert
   für Erwachsene (Richtwert, gerundet, geschlechtsunabhängiger
   Orientierungswert – siehe README für Quellen/Einschränkungen). */
const NUTRIENTS = [
  { key: "vitA",   label: "Vitamin A",   unit: "µg", dailyRef: 800 },
  { key: "vitC",   label: "Vitamin C",   unit: "mg", dailyRef: 100 },
  { key: "vitD",   label: "Vitamin D",   unit: "µg", dailyRef: 20 },
  { key: "vitE",   label: "Vitamin E",   unit: "mg", dailyRef: 12 },
  { key: "vitK",   label: "Vitamin K",   unit: "µg", dailyRef: 70 },
  { key: "b1",     label: "Vitamin B1 (Thiamin)",   unit: "mg", dailyRef: 1.1 },
  { key: "b2",     label: "Vitamin B2 (Riboflavin)", unit: "mg", dailyRef: 1.3 },
  { key: "niacin", label: "Niacin",      unit: "mg", dailyRef: 14 },
  { key: "b6",     label: "Vitamin B6",  unit: "mg", dailyRef: 1.4 },
  { key: "folat",  label: "Folat",       unit: "µg", dailyRef: 300 },
  { key: "b12",    label: "Vitamin B12", unit: "µg", dailyRef: 4.0 },
  { key: "ca",     label: "Calcium",     unit: "mg", dailyRef: 1000 },
  { key: "fe",     label: "Eisen",       unit: "mg", dailyRef: 15 },
  { key: "mg",     label: "Magnesium",   unit: "mg", dailyRef: 350 },
  { key: "zn",     label: "Zink",        unit: "mg", dailyRef: 10 },
  { key: "k",      label: "Kalium",      unit: "mg", dailyRef: 4000 },
];

const MEAL_TYPES = [
  { key: "fruehstueck", label: "Frühstück" },
  { key: "mittagessen", label: "Mittagessen" },
  { key: "abendessen",  label: "Abendessen" },
];

const DIET_MODES = [
  { key: "keine",           label: "Keine Einschränkung" },
  { key: "vegetarisch_pref",label: "Vegetarisch bevorzugt" },
  { key: "vegetarisch_nur", label: "Nur vegetarisch" },
  { key: "vegan_pref",      label: "Vegan bevorzugt" },
  { key: "vegan_nur",       label: "Nur vegan" },
];

/* Max.-Richtwerte pro Mahlzeit (grobe Ableitung aus DGE-Tagesobergrenzen
   geteilt durch 3 Mahlzeiten) — nur zur Einordnung, keine harte Grenze. */
const MEAL_MAX = { fettG: 27, zuckerG: 17, salzG: 2 };

/* EU-Referenzmengen (Nährwertkennzeichnung, "Referenzmenge für einen
   durchschnittlichen Erwachsenen"): 2000 kcal, 50 g Eiweiß. Werden für
   den Nährstoffdichte-Filter bei Zutat 2/3 verwendet (siehe unten). */
const EU_REF_KCAL = 2000;
const EU_REF_PROTEIN_G = 50;
/* Weitere EU-Referenzmengen (Nährwertkennzeichnung): Fett 70 g/Tag,
   Zucker 90 g/Tag — werden für den Zutat-1-Filter (siehe unten)
   verwendet. */
const EU_REF_FETT_G = 70;
const EU_REF_ZUCKER_G = 90;
/* Faktor, um den der Nährstoffanteil am Tagesbedarf höher sein muss als
   der Kalorienanteil am Tagesbedarf, damit ein Lebensmittel bei Zutat 2/3
   als ausreichend nährstoffdicht gilt. */
const NUTRIENT_DENSITY_FACTOR = 2;

/* Anzahl der je Anfrage generierten Rezepte. */
const RECIPE_COUNT = 5;

/* Referenzwert für die "durchschnittliche Mischkost-Mahlzeit": ca. 1,7 t
   CO2e/Jahr für die Ernährung einer Person in Deutschland (Größenordnung
   nach UBA/Öko-Institut-Schätzungen), geteilt durch ca. 1.095 Mahlzeiten
   (365 Tage × 3) ≈ 1,55 kg CO2e je Mahlzeit. Grobe Orientierungsgröße,
   keine exakte Messung. */
const AVERAGE_MEAL_CO2_KG = 1.55;

/* PKW-Vergleichswert wie vom Nutzer vorgegeben. */
const CAR_G_CO2_PER_KM = 120;

/* ---------------- Abgeleitete Berechnungen ---------------- */

function co2PerKcal(food) {
  if (!food.kcal) return null;
  return (food.co2 * 1000) / (food.kcal * 10); // g CO2 je kcal
}
function co2PerGProtein(food) {
  if (!food.eiweiss) return null;
  return (food.co2 * 1000) / (food.eiweiss * 10); // g CO2 je g Eiweiß
}
function co2PerNutrientUnit(food, key) {
  const v = food[key];
  if (!v) return null;
  return (food.co2 * 1000) / (v * 10); // g CO2 je mg/µg (Einheit wie hinterlegt)
}

/* Nährstoffdichte-Kriterium für Zutat 2 (Eiweiß) und Zutat 3 (gewählter
   Nährstoff): Der Deckungsanteil am jeweiligen Tagesbedarf (Eiweiß bzw.
   Nährstoff) je 100g muss HÖHER sein als der Deckungsanteil am
   Kalorien-Tagesbedarf je 100g — die Zutat soll also proportional mehr
   zum Nährstoffbedarf als zum Kalorienbudget beitragen ("nährstoffdicht"
   statt nur kalorienreich mit Spuren des Nährstoffs). */
function kcalPct100g(food) {
  return (food.kcal / EU_REF_KCAL) * 100;
}
function proteinPct100g(food) {
  return (food.eiweiss / EU_REF_PROTEIN_G) * 100;
}
function nutrientPct100g(food, key) {
  const meta = NUTRIENTS.find((n) => n.key === key);
  return (food[key] / meta.dailyRef) * 100;
}
function isNutrientDense(food, key) {
  if (!food.kcal || food.kcal <= 0) return false; // 0-kcal-Lebensmittel (Wasser, Salz) ausschließen
  const nutrientShare = key === "eiweiss" ? proteinPct100g(food) : nutrientPct100g(food, key);
  if (nutrientShare < NUTRIENT_DENSITY_FACTOR * kcalPct100g(food)) return false;
  const requiredGrams = requiredGramsForHalfDaily(food, key);
  if (requiredGrams === null) return false;
  return requiredGrams <= typicalMaxPortionG(food);
}

/* Gramm-Menge, die von "food" nötig wäre, um allein 50% des Tagesbedarfs
   von "key" zu decken ("eiweiss" oder ein NUTRIENTS-Schlüssel). Von
   data.js (Dropdown-Filter) UND app.js (DeepSeek-Prompt) gemeinsam genutzt. */
function requiredGramsForHalfDaily(food, key) {
  const isProtein = key === "eiweiss";
  const dailyRef = isProtein ? EU_REF_PROTEIN_G : (NUTRIENTS.find((n) => n.key === key) || {}).dailyRef;
  if (!dailyRef) return null;
  const perGram = isProtein ? (food.eiweiss || 0) / 100 : (food[key] || 0) / 100;
  if (!perGram) return null;
  return (0.5 * dailyRef) / perGram;
}

/* Rezeptübliche Höchstmenge je Portion nach Lebensmittelkategorie
   (musterbasiert). Verhindert unrealistische Mengen, z.B. >1kg Blattsalat
   für 50% des Eiweißbedarfs. */
const PORTION_MAX_RULES = [
  ["gewürz", 100], ["pfeffer", 100], ["safran", 20], ["vanille", 20],
  ["öl", 30], ["butter", 30], ["margarine", 30], ["kokosöl", 30],
  ["zucker", 60], ["honig", 60], ["sirup", 60], ["marmelade", 60], ["salz", 15],
  ["käse", 150], ["mascarpone", 100], ["ricotta", 150],
  ["sahne", 200], ["quark", 300], ["joghurt", 300],
  ["milch,", 400], ["milch-ersatz", 400], ["buttermilch", 400],
  ["ei, ", 180],
  ["nuss", 80], ["nüsse", 80], ["mandeln", 80], ["erdnüss", 80],
  ["kerne", 80], ["samen", 80], ["tahini", 60],
  ["fleisch", 400], ["hähnchen", 400], ["pute", 400], ["ente", 400], ["gans", 400],
  ["kaninchen", 400], ["wachtel", 300], ["leber", 200], ["niere", 200],
  ["herz", 200], ["zunge", 200], ["speck", 100], ["schinken", 150],
  ["salami", 100], ["wurst", 150], ["mortadella", 100], ["chorizo", 100],
  ["kasseler", 300], ["fisch", 400], ["lachs", 400], ["hering", 300],
  ["makrele", 300], ["sardin", 300], ["sardelle", 100], ["kabeljau", 400],
  ["seelachs", 400], ["scholle", 400], ["seezunge", 400], ["zander", 400],
  ["barsch", 400], ["thunfisch", 300], ["schwertfisch", 300], ["rotbarsch", 400],
  ["wels", 400], ["pangasius", 400], ["aal", 250], ["forelle", 400],
  ["karpfen", 400], ["muschel", 300], ["auster", 200], ["jakobsmuschel", 250],
  ["tintenfisch", 300], ["calamari", 300], ["oktopus", 300], ["krebs", 250],
  ["hummer", 250], ["garnele", 250], ["surimi", 200], ["fischstäbchen", 250],
  ["nudeln", 200], ["reis", 200], ["hafer", 150], ["gerste", 150],
  ["dinkel", 150], ["hirse", 150], ["quinoa", 150], ["couscous", 200],
  ["grieß", 150], ["polenta", 200], ["bulgur", 200], ["buchweizen", 150],
  ["amaranth", 150], ["graupen", 150], ["popcorn", 100], ["cornflakes", 100],
  ["brot", 150], ["brötchen", 150], ["baguette", 150], ["ciabatta", 150],
  ["fladenbrot", 150], ["naan", 150], ["pita", 150], ["brezel", 100],
  ["toast", 120], ["knäckebrot", 60], ["zwieback", 60], ["keks", 60],
  ["blätterteig", 100], ["pizzateig", 250], ["tortilla", 150],
  ["linsen", 150], ["kichererbsen", 200], ["bohnen", 250], ["erbsen", 250],
  ["mais,", 250], ["tofu", 300], ["tempeh", 250], ["seitan", 250],
  ["sojagranulat", 150], ["lupinenmehl", 100],
  ["schokolade", 60], ["kakaopulver", 30],
];
const PORTION_MAX_DEFAULT = 400; // Obst, Gemüse und alles nicht Gelistete

function typicalMaxPortionG(food) {
  const n = food.name.toLowerCase();
  for (const [keyword, max] of PORTION_MAX_RULES) {
    if (n.includes(keyword)) return max;
  }
  return PORTION_MAX_DEFAULT;
}

/* Zutat-1-Kriterium: Würde der GESAMTE Tages-Kalorienbedarf (EU_REF_KCAL)
   ausschließlich über dieses eine Lebensmittel gedeckt, dürfen die dabei
   anfallenden Mengen an Fett und Zucker die empfohlenen Tages-Höchstmengen
   (EU-Referenzmengen) nicht überschreiten. Filtert z.B. sehr fett- oder
   zuckerreiche, aber kalorisch "günstige" CO2-Lieferanten heraus. */
function isFettZuckerSafe(food) {
  if (!food.kcal || food.kcal <= 0) return false;
  const gramsForFullDay = (EU_REF_KCAL / food.kcal) * 100;
  const fettAtFullDay = (food.fett || 0) * (gramsForFullDay / 100);
  const zuckerAtFullDay = (food.zucker || 0) * (gramsForFullDay / 100);
  return fettAtFullDay <= EU_REF_FETT_G && zuckerAtFullDay <= EU_REF_ZUCKER_G;
}

/* Sortierte Listen für die Dropdowns (aufsteigend nach spezifischem CO2). */
function sortedCalorieSources() {
  return FOODS.map((f) => ({ food: f, value: co2PerKcal(f) }))
    .filter((x) => x.value !== null && isFettZuckerSafe(x.food))
    .sort((a, b) => a.value - b.value);
}
function sortedProteinSources() {
  return FOODS.map((f) => ({ food: f, value: co2PerGProtein(f) }))
    .filter((x) => x.value !== null && isNutrientDense(x.food, "eiweiss"))
    .sort((a, b) => a.value - b.value);
}
function sortedNutrientSources(key) {
  return FOODS.map((f) => ({ food: f, value: co2PerNutrientUnit(f, key) }))
    .filter((x) => x.value !== null && isNutrientDense(x.food, key))
    .sort((a, b) => a.value - b.value);
}

/* ---------------- Ernährungsweise-Klassifizierung ----------------
   Musterbasiert (bei 420 Lebensmitteln nicht mehr Zeile für Zeile
   manuell gepflegt): zuerst Veggie-/Vegan-Ersatzprodukte erkennen
   (immer vegan), dann Fleisch/Fisch-Schlüsselwörter (tierisch), dann
   Milch/Ei-Schlüsselwörter (vegetarisch), sonst vegan. */
const VEGAN_OVERRIDE_PATTERNS = [
  "ersatz", "vegan", "sojagranulat", "tofu", "tempeh", "seitan", "lupinenmehl",
];
const MEAT_FISH_PATTERNS = [
  "fleisch", "hähnchen", "pute", "ente", "gans", "kaninchen", "wachtel",
  "leber", "niere", "herz, rind", "zunge, rind", "speck", "schinken",
  "salami", "wurst", "mortadella", "corned beef", "chorizo", "kasseler",
  "fisch", "lachs", "hering", "makrele", "sardine", "sardelle", "kabeljau",
  "seelachs", "scholle", "seezunge", "zander", "barsch", "thunfisch",
  "schwertfisch", "rotbarsch", "wels", "pangasius", "aal", "forelle",
  "karpfen", "muschel", "auster", "jakobsmuschel", "tintenfisch", "calamari",
  "oktopus", "krebs", "hummer", "matjes", "fischstäbchen", "surimi",
  "garnele", "hirsch", "bratwurst", "frankfurter würstchen",
];
const DAIRY_EGG_PATTERNS = [
  "ei, durchschnitt", "milch, ", "käse", "joghurt, ", "quark,", "magerquark",
  "sahne", "butter", "mascarpone", "ricotta", "mozzarella", "burrata",
  "brie", "camembert", "feta", "gouda", "edamer", "tilsiter", "bergkäse",
  "halloumi", "provolone", "appenzeller",
];
function animalCategory(foodName) {
  const n = foodName.toLowerCase();
  if (VEGAN_OVERRIDE_PATTERNS.some((p) => n.includes(p))) return "vegan";
  if (MEAT_FISH_PATTERNS.some((p) => n.includes(p))) return "tierisch";
  if (DAIRY_EGG_PATTERNS.some((p) => n.includes(p))) return "vegetarisch";
  return "vegan";
}
function allowedByDiet(foodName, dietKey) {
  const cat = animalCategory(foodName);
  if (dietKey === "vegan_nur") return cat === "vegan";
  if (dietKey === "vegetarisch_nur") return cat !== "tierisch";
  return true;
}

/* Für die Zutat-1/2/3-Auswahllisten sollen nur Hauptnahrungsmittel
   erscheinen, keine Gewürze/Kräuter (die als "Quelle"-Tag "frische
   Kräuter" bzw. "getrocknete Gewürze" tragen, siehe merge_final.py /
   Excel-Spalte "Quelle/Kategorie"). Gewürze bleiben Teil der Datenbank
   (z.B. für die Zutatenliste eines generierten Rezepts), tauchen aber
   nicht als auswählbare Zutat 1/2/3 auf. */
function isMainFood(food) {
  const src = (food.source || "").toLowerCase();
  return !src.includes("kräuter") && !src.includes("gewürze");
}

/* ---------------- Farbmarkierung nach Abweichung vom Listendurchschnitt ----------------
   🟢 ≤50% · 🟡 50–100% · 🟠 100–150% · 🔴 150–200% · 🟣 >200% des Durchschnitts
   der jeweils aktuell angezeigten (bereits gefilterten) Liste. */
function averageValue(list) {
  if (!list.length) return 0;
  return list.reduce((s, x) => s + x.value, 0) / list.length;
}
function co2ColorEmoji(value, average) {
  if (!average) return "";
  const pct = (value / average) * 100;
  if (pct <= 50) return "🟢";
  if (pct <= 100) return "🟡";
  if (pct <= 150) return "🟠";
  if (pct <= 200) return "🔴";
  return "🟣";
}

/* Zutat 4 & 5 und der Zutaten-Editor: ALLE Lebensmittel zulassen (keine
   Nährstoffdichte-/Fett-Zucker-/Hauptnahrungsmittel-Filterung), damit z.B.
   auch Tomaten frei wählbar sind. Alphabetisch sortiert. */
function allFoodsAlphabetical() {
  return [...FOODS].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/* Eier werden in Stück statt Gramm angegeben (1 Stück ≈ 58 g). */
const EGG_WEIGHT_G = 58;
function isEggFood(food) {
  return !!(food && food.name && food.name.toLowerCase().startsWith("ei,"));
}
function displayUnitFor(food) {
  return isEggFood(food) ? "Stück" : "g";
}
function gramsFromDisplayValue(food, displayValue) {
  return isEggFood(food) ? displayValue * EGG_WEIGHT_G : displayValue;
}
function displayValueFromGrams(food, grams) {
  return isEggFood(food) ? Math.round((grams / EGG_WEIGHT_G) * 10) / 10 : grams;
}
