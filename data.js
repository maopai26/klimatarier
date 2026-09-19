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
// K..Z=10..25 die 16 Nährstoffe in dieser Reihenfolge:
const EXCEL_NUTRIENT_COLUMN_ORDER = [
  "vitA", "vitC", "vitD", "vitE", "vitK", "b1", "b2", "niacin",
  "b6", "folat", "b12", "ca", "fe", "mg", "zn", "k",
];

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
  return nutrientShare > kcalPct100g(food);
}

/* Sortierte Listen für die Dropdowns (aufsteigend nach spezifischem CO2). */
function sortedCalorieSources() {
  return FOODS.map((f) => ({ food: f, value: co2PerKcal(f) }))
    .filter((x) => x.value !== null)
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
