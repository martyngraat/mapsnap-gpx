# GeoForge Navigator 🧭🥾

GeoForge Navigator is een superstrakke, PWA-compatibele (offline first) GPS-app voor outdoor-avonturiers, wandelaars en kampeerders. De app combineert geavanceerde hulpmiddelen zoals routeplanners, meetlatten, topografische kaarten, en live deellinks met een volledig configureerbare API-Toolbox backend.

---

## 🔗 Belangrijke Links

- **GitHub Repository:** [https://github.com/martyngraat/mapsnap-gpx](https://github.com/martyngraat/mapsnap-gpx)
- **Live Web App (PWA):** [https://martyngraat.github.io/mapsnap-gpx/](https://martyngraat.github.io/mapsnap-gpx/)

---

## 🧰 API-Toolbox Configuratiescherm & Dekkingsgebied

Om de app snel en accuraat te houden op mobiele apparaten, beschikt GeoForge over een **API-Toolbox**. Gebruikers kunnen hiermee individuele datakoppelingen en kaartlagen in- of uitschakelen. 

Elke API is voorzien van een **dekkingslabel** in het configuratiescherm:

### 🟢 Wereldwijde API's (Overal actief)
- **Gemini AI Vision:** Identificeert planten, dieren en sporen aan de hand van foto's.
- **MapTiler Maps:** Laadt prachtige vector-gebaseerde Outdoor- en Wintersportkaarten.
- **OpenRouteService & BRouter:** Berekent wandelroutes, fietspaden en 30-minuten wandelbereiken (isochronen).
- **RainViewer Buienradar:** Toont live en geanimeerde neerslagradar overlays.
- **Blitzortung Live Bliksem:** Visualiseert real-time blikseminslagen.
- **GBIF Checklist & Xeno-Canto:** Zoekt lokale diersoorten en vogelgeluidopnames.
- **Macrostrat Bodemscan:** Geeft de geologische ondergrond onder je voeten weer.
- **Wikipedia Geosearch & iNaturalist POIs:** Vindt Wikipedia-artikelen en natuurwaarnemingen in de buurt.
- **Mapillary Straatbeeld:** Opent direct interactieve straatbeeld- en omgevingsfoto's rondom het kaartmidden.

### 🟠 Regio-specifieke / Ultraspecifieke API's
- **Natura 2000 Natuurbescherming:** Europa-brede begrenzingen van beschermde natuurgebieden (EU).
- **Toerisme Vlaanderen POIs:** Toeristische bezienswaardigheden en erfgoed in Vlaanderen.
- **Rijksmonumenten Register:** Rijksmonumenten stippen op de kaart van Nederland.
- **Noorwegen Topo (Kartverket):** Officiële, uiterst gedetailleerde topografische wandelkaarten van Noorwegen.
- **VanStops UK:** Camperplaatsen en pub stopovers in het Verenigd Koninkrijk.
- **Active Campsite Search:** Noord-Amerikaanse campings en caravanplaatsen (US/CA).

---

## 🔍 Hoe werkingsgebieden en grenzen worden doorbroken

Hoewel sommige API's regiospecifiek zijn (zoals **Toerisme Vlaanderen** of **VanStops UK**), zijn ze niet gekoppeld aan de fysieke GPS-locatie van de gebruiker. 

### Map-Viewport Geometrie
Alle POI-scans, OpenCampingMap en historische query-engines doorzoeken de **actieve kaart-viewport (wat je op je scherm ziet)** of het **kaartcenter**.
- **Voorbeeld:** Als je in Nederland, Frankrijk of Duitsland bent en je wilt alvast camperplaatsen of monumenten in Vlaanderen of het Verenigd Koninkrijk bekijken, sleep (pan) je simpelweg de kaart naar dat gebied en klik je op **🔍 Zoek Geselecteerde POIs**. De app haalt direct de data van die regio op!
- Dit stelt wandelaars in staat om hun reizen en overnachtingen over de grens naadloos voor te bereiden.

---

## 🧑‍💻 Ontwikkelaarshandleiding

Wil je zelf een nieuwe locatie-gerelateerde API toevoegen of het filtergedrag aanpassen? Zie de gedetailleerde architectuurhandleiding:
👉 [api_toolbox_architecture.md](api_toolbox_architecture.md)

---

## 📡 Live Positie-Beacon (Real-time Sharing)

GeoForge Navigator beschikt over een real-time cloud tracking systeem aangedreven door Firebase:
1. Schakel **Uitzenden starten (Deel live je locatie)** in op het Dashboard.
2. Kopieer en deel de unieke link.
3. Ontvangers kunnen je live wandelpositie en gelopen pad real-time volgen op hun eigen kaart, zonder dat zij een account nodig hebben!
