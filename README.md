# Battletanks

Egy böngészőből játszható, valós idejű, 2D tankos tüzérségi játék rombolható terepekkel, szél fizikával és őrült égből hulló meglepetésekkel! 

## Játékmenet

A cél pofonegyszerű: elpusztítani az ellenséges tankot! Ehhez a domborzat adottságait, a szélirányt és az égből hulló bónuszokat is figyelembe kell venned.

- **Rombolható Terep:** Minden lövedék és bomba krátert üt a földbe. Ha a talajt teljesen kirobbantod valaki alól, az kizuhan a pályáról és azonnal veszít! Emellett a meredek kráterfalakon a tankok nem tudnak túljutni.
- **Szél:** Minden kör elején egy új, véletlenszerű szélerősség és irány (Wind) generálódik. Ez a szél a kör során folyamatos vízszintes erőt fejt ki a repülő lövedékekre (eltéríti őket), illetve a lassan ereszkedő segélycsomagokra.
- **Üzemanyag:** Minden tank üzemanyaga korlátozott (egy vízszintes sáv jelzi). Lőni és célozni kifogyott üzemanyaggal is lehet, de a tank utána már egy centit sem mozdul.

## Repülők ✈️

A csata hevében időről-időre repülők húznak át az égen! Ezek a gépek a pálya véletlenszerű pontján kioldják a rakományukat, ami két dolog lehet:
1. **Bomba 💣:** Teljesen úgy viselkedik, mint egy kilőtt tank lövedék. Szörnyű pusztítást végez, krátert robbant és sebez bárkit a közelben. AI játékos ezelől menekülni fog.
2. **Segélycsomag (Fehér doboz piros kereszttel) 🎁:** Ejtőernyőn ereszkedik alá (így jobban fújja a szél). Ha valaki (akár az AI, akár te) hozzáér, felveszi. Az AI minden eldobott munkát felfüggeszt és a csomagért rohan! Ha felveszi valaki az alábbi bónuszok egyikét kapja (véletlenszerűen):
   - *Sebezhetetlenség (Pajzs):* Kék erőtér jelenik meg a tank körül 10-15 másodpercre. Sem a telitalálatok, sem a robbanások nem sebzik (viszont a "pályáról kizuhanás" ellen nem véd!).
   - *Gépágyú mód:* 5 másodperc erejéig a tűzgomb nyomva tartásával sorozatot lehet lőni (mint egy géppuska), töltési idő és erőszabályzás nélkül!

## Játékmódok és Irányítás

A játék alapértelmezetten **1 Játékos (Ember vs. AI)** módban indul. A gép (CPU) játékos próbál elmenekülni a bombázók elől és rohan a dobozokért miközben titeket vesz célba!

### 1. Játékos (Player 1 - Fekete Tank) Irányítás:
- **`←` / `→` (Balra/Jobbra nyíl):** Tank mozgatása (amíg van üzemanyag)
- **`↑` / `↓` (Fel/Le nyíl):** A lövegtorony dőlésszögének (célzás) állítása
- **`Space` (Szóköz):** Lövés. **Tartsd nyomva**, hogy növeld a lövedék erejét, majd **engedd fel** a tüzeléshez!

---

Mihelyst valaki megnyomja a **W, A, S, D** vagy az **Q** gombok valamelyikét a billentyűzeten, a játék megszakítja a gép vezérlését és azonnal átvált **2 Játékos módra (Lokális co-op)**! Ekkor a győzelmi számlálók lenullázódnak, és tiszta lappal mérkőzhettek meg egy gépen.

### 2. Játékos (Player 2 - Piros Tank) Irányítás:
- **`A` / `D`:** Tank mozgatása
- **`W` / `S`:** Célzás (Torony fel/le)
- **`Q`:** Lövés. (Nyomva tart és felenged gyorsbillentyűként az egyes játékoshoz hasonlóan)
