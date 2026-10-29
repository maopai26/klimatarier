# 🌱 Klima-Rezepte

Eine installierbare Web-App (PWA), die **klimafreundliche Rezepte generiert**
und dabei den wöchentlichen Bedarf an lebensnotwendigen Vitaminen und
Mineralstoffen im Blick behält. Rezepte werden von der **DeepSeek-KI**
erzeugt und mit einer lokalen CO2-/Nährwert-Datenbank (44 Lebensmittel,
Deutschland-/Saison-Werte aus den ifeu-Studien) nachgerechnet — die
angezeigten CO2- und Nährwertzahlen stammen also nicht von der KI selbst,
sondern aus unserer geprüften Datenbank.

## ⚠️ Zwei wichtige Einschränkungen, die du kennen solltest

**1. DeepSeek-Aufruf könnte an CORS scheitern.** Die App ruft die
DeepSeek-API direkt aus dem Browser auf (kein eigener Server). Die meisten
KI-APIs (auch OpenAI, Anthropic) blockieren solche direkten
Browser-Aufrufe aus Sicherheitsgründen per CORS, weil sie für
Server-zu-Server-Nutzung gedacht sind. Ob DeepSeek das genauso handhabt,
konnte ich nicht selbst testen. **Teste es nach dem Deployment einmal
kurz** (Grundeinstellungen → API-Key eintragen → Rezepte generieren).

Falls im Browser ein CORS-Fehler auftaucht (F12 → Konsole prüfen), brauchst
du einen winzigen Proxy dazwischen. Der einfachste kostenlose Weg ist ein
**Cloudflare Worker** (kein eigener Server nötig):

```js
// worker.js — bei workers.cloudflare.com kostenlos deployen
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }});
    }
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": request.headers.get("Authorization") },
      body: await request.text(),
    });
    const body = await res.text();
    return new Response(body, { status: res.status, headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    }});
  }
}
```
Dann in `app.js` die Zeile `const url = "https://api.deepseek.com/chat/completions";`
durch die URL deines Workers ersetzen (z.B. `https://dein-worker.workers.dev`).

**2. DeepSeek "sucht" nicht im Internet.** Die API generiert Rezepte aus
ihrem trainierten Wissen (wie ein sehr belesener Koch aus dem Gedächtnis
kocht), sie browst keine Webseiten. Die Rezeptideen sind plausibel und
alltagstauglich, aber nicht aus einer Datenbank realer, verlinkter Rezepte
zusammengesucht. Die CO2- und Nährwertangaben stammen dagegen NICHT von
DeepSeek, sondern werden von der App selbst aus den generierten
Zutatenlisten gegen unsere geprüfte Datenbank berechnet — das ist der
verlässliche Teil.

## Funktionsumfang

- **Grundeinstellungen**: Personenzahl, Ernährungsweise (keine Einschränkung /
  vegetarisch bevorzugt / nur vegetarisch / vegan bevorzugt / nur vegan),
  freie Vorlieben/Unverträglichkeiten, DeepSeek-API-Key (nur lokal im
  Browser gespeichert, `localStorage` — verlässt dein Gerät nie außer bei
  der direkten Anfrage an DeepSeek).
- **Wizard**: Mahlzeit wählen → Kalorienlieferant (Dropdown, aufsteigend
  nach CO2/kcal sortiert) → Eiweißlieferant (aufsteigend nach CO2/g
  Eiweiß) → Nährstoff-Typ + Lieferant dafür (aufsteigend nach CO2/mg
  bzw. µg) → generieren.
- **5 Rezeptkarten** je Anfrage mit kcal/Portion & gesamt, CO2/Portion &
  gesamt, Ersparnis in Auto-km (ggü. 1,55 kg CO2e/Mahlzeit
  Durchschnitts-Mischkost, 120 g CO2/km), Tagesbedarfsdeckung je
  Nährstoff als Balken.
- **Speichern (♥)**: Rezepte merken sich lokal; bei künftigen Anfragen mit
  gleicher Mahlzeit/Ernährungsweise werden passende gespeicherte Rezepte
  automatisch bevorzugt vor neuen DeepSeek-Anfragen verwendet — spart
  API-Kosten und Wartezeit.
- **PDF-Export**: pro Karte oder als Sammlung, über die Druckfunktion des
  Browsers (A4, eine Karte pro Seite).
- **Fortschritt**: aufsummierte Tagesbedarfsdeckung (0–100 %) der letzten
  3 gespeicherten Rezepte je Nährstoff.

## Änderungen in v0.2

- **Datenbank auf 420 Lebensmittel erweitert** (vorher 44): 177 direkt aus
  der ifeu-Studie 2020 „Ökologische Fußabdrücke von Lebensmitteln und
  Gerichten in Deutschland" (vermittelt über die Quellenliste des
  HLNUG-CO2-Rechners), 8 aus den zuvor genutzten ifeu-2013-/Poore&Nemecek-/
  Thünen-Quellen, 235 systematisch geschätzt in Analogie zu diesen
  Ankerwerten (siehe Excel, Blatt „Methodik & Quellen", Abschnitt 0).
  1.000 Lebensmittel wie ursprünglich angefragt wurden nicht erreicht —
  siehe Methodik-Blatt für die Begründung und ein Angebot zur Fortsetzung.
- **Nur noch 5 statt 10 Rezepte** pro Anfrage.
- **Umbenennung**: „Kalorienlieferant" → „Zutat 1 – Energielieferant",
  „Eiweißlieferant" → „Zutat 2 – Eiweißlieferant", der frei wählbare
  Nährstoff-Lieferant → „Zutat 3 – [Nährstoffname]-Lieferant".
- **Nährstoffdichte-Filter bei Zutat 2 & 3**: In den Dropdowns erscheinen
  nur noch Lebensmittel, bei denen der Deckungsanteil am Tagesbedarf des
  jeweiligen Nährstoffs (Eiweiß bzw. gewählter Vitamin/Mineralstoff)
  HÖHER ist als der Deckungsanteil am Kalorien-Tagesbedarf (EU-Referenz:
  2000 kcal, 50 g Eiweiß) — Zucker oder Öl fallen z.B. beim
  Eiweiß-Dropdown automatisch raus, da sie kalorisch, aber nicht
  eiweißreich sind.
- **Gespeicherte Rezepte** werden jetzt nur noch dann als Ersatz für neue
  DeepSeek-Anfragen vorgeschlagen, wenn zusätzlich zu Mahlzeit und
  Ernährungsweise auch Zutat 1 UND Zutat 2 mit der aktuellen Auswahl
  übereinstimmen (vorher genügten Mahlzeit + Ernährungsweise).

## Änderungen in v0.3

- **Excel-Datei ist jetzt Teil des Repos und wird zur Laufzeit direkt
  eingelesen** (`CO2-Rucksack-Lebensmittel.xlsx`, Blatt „Rohdaten"), statt
  als starres JavaScript eingebettet zu sein. Du kannst die Excel-Datei
  jederzeit manuell öffnen, Werte ändern oder Zeilen ergänzen, per Git
  committen — die App übernimmt das beim nächsten Laden automatisch,
  ohne Code-Änderung. Voraussetzung: die Spaltenreihenfolge im Blatt
  „Rohdaten" darf sich nicht ändern (siehe `EXCEL_NUTRIENT_COLUMN_ORDER`
  in `data.js`), sonst verrutscht die Zuordnung. Zum Einlesen wird die
  Bibliothek SheetJS/xlss.js von cdnjs.cloudflare.com nachgeladen (Internet
  beim ersten Aufruf nötig).
- **Zutat 2 (Eiweiß) und Zutat 3 (gewählter Nährstoff): mindestens 50 % des
  Tagesbedarfs pro Portion.** Das wird NICHT nachträglich in der App
  „schöngerechnet", sondern der KI als konkrete Gramm-Zielvorgabe für die
  gezielte Rezeptsuche mitgegeben (z.B. „plane pro Portion mit ca. 104 g
  Linsen — das deckt ca. 50 % des Eiweiß-Tagesbedarfs"). Die App berechnet
  danach ehrlich die tatsächlich erreichte Deckung aus den echten
  Zutatenmengen der Antwort — trifft DeepSeek die Vorgabe nicht genau,
  siehst du das unverfälscht an der Balkenfarbe/dem Prozentwert der Karte
  (Grün ab 50 %, Gelb 20–50 %, Rot darunter).
- **Gewürze & Kräuter erscheinen nicht mehr in den Zutat-1/2/3-Dropdowns**
  (41 von 420 Lebensmitteln, erkannt an der Quellen-Kategorie „frische
  Kräuter"/„getrocknete Gewürze"). Sie bleiben Teil der Datenbank und
  können weiterhin als Würzzutat in generierten Rezepten vorkommen, sind
  aber nicht als Zutat 1/2/3 auswählbar.

## Änderungen in v0.4

- **Neue Spalte „Zucker je 100g"** in der Excel-Datei (Blatt „Rohdaten",
  Spalte AA) — geschätzt als Kategorie-Anteil an den Kohlenhydraten (siehe
  Methodik-Blatt, Abschnitt 8), da weder Poore & Nemecek noch die
  ifeu-Studien Zuckerwerte ausweisen.
- **Zutat 2/3-Filter verschärft**: Der Deckungsanteil am Tagesbedarf des
  Nährstoffs muss jetzt **mindestens doppelt so hoch** sein wie der
  Deckungsanteil am Kalorien-Tagesbedarf (vorher: nur höher).
- **Neuer Zutat-1-Filter**: Ein Lebensmittel erscheint nur noch als
  Energielieferant, wenn es bei alleiniger Deckung des gesamten
  Tages-Kalorienbedarfs (EU-Referenz 2000 kcal) NICHT die empfohlenen
  Tages-Höchstmengen für Fett (70 g) oder Zucker (90 g) überschreiten
  würde. Das filtert z.B. Öle, Butter, Zucker und Schokolade heraus, auch
  wenn ihr CO2/kcal-Wert niedrig ist — übrig bleiben ausgewogene
  Energielieferanten wie Haferflocken, Vollkornnudeln oder Bulgur.
- **Portionsgröße gedeckelt**: höchstens 800 statt 1000 kcal pro Portion
  (harte Obergrenze im Prompt an DeepSeek).
- **Hinweis auf übliche Zutatenmengen** im Prompt ergänzt, damit DeepSeek
  keine unrealistischen Mengen vorschlägt, um die Zutat-2/3-Zielwerte zu
  erreichen.

## Änderungen in v0.5

- **„Keine"-Option** bei Zutat 2 und Zutat 3 — lässt sich auswählen, wenn
  keine Vorgabe für Eiweiß- bzw. Nährstofflieferant gemacht werden soll.
- **Zutat 4 & Zutat 5**: frei wählbare, zusätzliche Hauptnahrungsmittel
  über ein Textfeld mit Autovervollständigung (HTML-`<datalist>`,
  gespeist aus derselben Liste wie Zutat 1). Bei exaktem Treffer erscheint
  ein Badge mit CO2/kcal-Wert. Beide sind optional und werden als frei
  gewählte Wunschzutaten an DeepSeek weitergegeben.
- **Farbmarkierung aller vier/fünf Auswahllisten** nach CO2-Abweichung vom
  Durchschnitt der jeweils angezeigten (bereits gefilterten) Liste: 🟢
  ≤50 % · 🟡 50–100 % · 🟠 100–150 % · 🔴 150–200 % · 🟣 &gt;200 %. Umgesetzt
  über Kreis-Emoji vor dem Optionstext (nicht über CSS-Hintergrundfarben
  auf `<option>`, da diese von iOS/Safari ignoriert werden und die
  Markierung dort sonst unsichtbar bliebe).

## Änderungen in v0.6

- **Zutat 2/3: nur rezeptübliche Mengen.** Ein Lebensmittel erscheint nur noch,
  wenn die Menge für 50 % des Tagesbedarfs eine übliche Portionsgröße nicht
  überschreitet (Obst/Gemüse/Fleisch/Fisch max. 400 g, Käse 150 g, Nudeln/Reis
  200 g, Nüsse 80 g, Öle/Butter 30 g, Gewürze 100 g u. a. — siehe
  `PORTION_MAX_RULES` in `data.js`). Beispiel: Feldsalat (über 1 kg für den
  Eiweißbedarf) fällt heraus.
- **Zutat 4/5 lassen jetzt alle 420 Lebensmittel zu** (auch Tomaten etc.),
  ohne Nährstoffdichte-/Fett-/Zucker-Filter.
- **Rezeptkarten sind editierbar**: Zutaten ändern (Suchfeld mit Liste aller
  Lebensmittel), Mengen ändern, löschen, hinzufügen (max. 10). CO2-Einsparung
  und alle Nährwerte werden live neu berechnet; Änderungen an gespeicherten
  Rezepten werden mitgespeichert.
- **„+ Eigenes Rezept erstellen"** (Ergebnis-Tab): leere Karte für bis zu 10
  Zutaten samt Mengen aus der Datenbank — ohne DeepSeek-Suche.
- **Neue Karten-Ansicht**: Oben steht die konkrete CO2-Einsparung in kg CO2e
  (plus Auto-km); kcal/Portion, CO2/Portion und CO2 gesamt entfallen. Die
  Tagesbedarfsdeckung zeigt zusätzlich Kcal, Protein, Fett und Zucker (je
  Portion, gegen EU-Referenzmengen 2000 kcal / 50 g / 70 g / 90 g).
- **Eier in Stück** statt Gramm (1 Stück ≈ 58 g; intern weiter in Gramm).
- **Fehlerkorrektur Zutaten-Zuordnung**: Die Alias-Tabelle stammte noch aus der
  44-Lebensmittel-Zeit; zudem ordnete die Teilstring-Suche z. B. „Salbei" zu
  „Ei" und „Sojamilch" zu Kuhmilch zu. Jetzt wortbasiert, spezifischste
  Schlüssel zuerst, alle Alias-Ziele gegen die Datenbank geprüft (24
  Testfälle bestanden). Nicht erkannte Zutaten werden rot umrandet.

## Wichtige Vereinfachungen (Transparenz)

- **"Wöchentliche Bedarfsdeckung durch 10 Rezepte"**: Die App bittet
  DeepSeek in einem einzigen Prompt, alle 10 Rezepte so zu gestalten, dass
  sie zusammen den Wochenbedarf abdecken, und zeigt anschließend die
  tatsächlich (aus der Datenbank) berechnete Deckung an. Das ist eine
  Bitte an die KI, keine harte Optimierung/Garantie — es gibt keinen
  clientseitigen Optimierungsalgorithmus, der Rezepte gezielt nachjustiert.
- **Zutaten-Zuordnung**: Nur Zutaten, deren Name (auch über eine kleine
  Alias-Liste) in unserer 44-Lebensmittel-Datenbank gefunden wird, fließen
  in CO2/Nährwert ein. Gewürze, Kräuter, Öle außer Rapsöl usw. werden in
  der Zutatenliste angezeigt, aber mit "(nicht in CO2-Datenbank erfasst)"
  gekennzeichnet und nicht mitgerechnet (in der Regel ohnehin
  vernachlässigbar in kleinen Mengen).
- **Tagesreferenzwerte**: grobe, geschlechtsunabhängige Orientierungswerte
  nach DGE/D-A-CH-Referenzwerten (siehe `data.js`, Konstante `NUTRIENTS`),
  keine individuelle Ernährungsberatung.
- **"Konto"**: Es gibt kein echtes Nutzerkonto mit Login — Gespeichertes
  liegt ausschließlich lokal im Browser (`localStorage`) dieses einen
  Geräts/Browsers. Bei anderem Gerät/Browser oder gelöschten Browserdaten
  ist es weg. Für ein echtes geräteübergreifendes Konto wäre ein Backend
  (z.B. Firebase/Supabase) nötig — das ist hier bewusst nicht enthalten,
  um die App als reine statische GitHub-Pages-Seite lauffähig zu halten.

## Auf GitHub veröffentlichen (GitHub Pages)

```bash
git init
git add .
git commit -m "Klima-Rezepte v0.1"
git branch -M main
git remote add origin https://github.com/<dein-nutzername>/<dein-repo>.git
git push -u origin main
```
Dann im Repo unter **Settings → Pages** den `main`-Branch als Quelle wählen.

## Installation auf dem Handy

Nach dem Öffnen der GitHub-Pages-Adresse: Android/Chrome → Menü ⋮ → „Zum
Startbildschirm hinzufügen"; iOS/Safari → Teilen-Symbol → „Zum
Home-Bildschirm". Das Blatt-auf-Teller-Icon erscheint dann als App-Symbol.

## Projektstruktur

```
klima-rezepte-app/
├── index.html          Wizard-, Ergebnis-, Speicher- und Fortschritts-Ansichten
├── style.css            Dashboard-Gestaltung
├── app.js                Wizard-Logik, DeepSeek-Aufruf, Berechnung, Speicherung, PDF
├── data.js                44 Lebensmittel (CO2 + Nährwerte) + DGE-Referenzwerte
├── manifest.json           PWA-Manifest
├── service-worker.js        Offline-Cache (network-first)
├── icons/                    App-Icons
└── README.md
```

## Datenquellen

CO2-Werte: Poore & Nemecek (2018)/Our World in Data; ifeu Heidelberg,
Fleisch- und Gemüse-Bericht Baden-Württemberg (2013); Thünen-Institut
(Milch); Alcock et al. (2022, Rapsöl) — identisch zur zuvor erstellten
Datei `CO2-Rucksack-Lebensmittel.xlsx`. Tagesreferenzwerte: DGE/D-A-CH
(Richtwerte, gerundet). Durchschnittswert Mischkost-Mahlzeit: grobe
Ableitung aus UBA/Öko-Institut-Schätzungen (~1,7 t CO2e/Jahr Ernährung
pro Kopf ÷ ~1.095 Mahlzeiten/Jahr).
