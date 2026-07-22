# 🗺️ GeoForge Navigator — Catalogus van API's, Overlays & Backlog

Dit document biedt een compleet overzicht van alle geïntegreerde bronnen, kaartlagen, API's en functionele modules in **GeoForge Navigator**, evenals de geplande uitbreidingen op de backlog.

---

## 📑 Inhoudsopgave
1. [🧭 Basiskaarten (Base Maps)](#1--basiskaarten-base-maps)
2. [🗺️ Kaart Overlays (Layer Overlays)](#2-%EF%B8%8F-kaart-overlays-layer-overlays)
3. [🔌 Geïntegreerde API's & Services](#3--ge%C3%AFntegreerde-apis--services)
   - [Dashboard, Weer & Noodlocatie](#31-dashboard-weer--noodlocatie)
   - [Kamperen, Overnachten & Verhuur](#32-kamperen-overnachten--verhuur)
   - [Natuur, Geologie & Soorten](#33-natuur-geologie--soorten)
   - [POI, Cultuur & Straatbeeld](#34-poi-cultuur--straatbeeld)
   - [Navigatie & Routenopping](#35-navigatie--routenopping)
   - [Cloud & Multi-User Sync](#36-cloud--multi-user-sync)
4. [🛠️ API-Toolbox Configuratiescherm](#4-api-toolbox-configuratiescherm)
5. [📋 Backlog & Toekomstige Functionaliteiten](#5--backlog--toekomstige-functionaliteiten)

---

## 1. 🧭 Basiskaarten (Base Maps)

| Basiskaart | Dekking | Beschrijving / Bron | Status |
| :--- | :--- | :--- | :---: |
| **OpenTopoMap** | Wereldwijd | Officiële topografische kaartstijl op basis van OSM data en SRTM hoogtelijnen. | 🟢 Actief |
| **OpenStreetMap Standard** | Wereldwijd | Standaard open-source wandel- en stratenkaart. | 🟢 Actief |
| **Esri World Imagery** | Wereldwijd | Hoge resolutie satelliet- en luchtfoto's. | 🟢 Actief |
| **CartoDB Technical Dark** | Wereldwijd | Donkere, contrastrijke kaartstijl voor nachtgebruik en batterijbesparing op OLED. | 🟢 Actief |
| **Kartverket Topo** | Noorwegen | Officiële topografische rasterkaart van Noorwegen via Noorse Kadaster. | 🟢 Actief |
| **Kadaster Topotijdreis (NL)** | Nederland | Historische Nederlandse topografische kaarten van 1815 tot 2020 met tijdschuif (via PDOK WMS). | 🟢 Actief |
| **OpenHistoricalMap (OHM)** | Wereldwijd | Wereldwijde historische vectorlagen met tijdschuif via MapLibre GL Vector Tiles. | 🟢 Actief |
| **MapTiler Outdoor** | Wereldwijd | Vector outdoor wandelkaart met hoogtelijnen en schaduwing *(vereist gratis API-sleutel)*. | 🟢 Actief |
| **MapTiler Winter** | Wereldwijd | Wintersport- en skikaart met pistes en skiliften *(vereist gratis API-sleutel)*. | 🟢 Actief |

---

## 2. 🗺️ Kaart Overlays (Layer Overlays)

| Overlay | Categorie | Dekking | Bron & Beschrijving |
| :--- | :--- | :--- | :--- |
| **Wandelnetwerk (Waymarked Trails)** | Routenetwerk | Wereldwijd | Markering van lokale wandelroutes, LAW's en Europese E-paden. |
| **Fietsnetwerk (Waymarked Trails)** | Routenetwerk | Wereldwijd | Fietsroutenetwerken, fietsknooppunten en internationale EuroVelo routes. |
| **Mountainbike (MTB Trails)** | Routenetwerk | Wereldwijd | Gemarkeerde mountainbikeroutes en singletracks. |
| **OSM Actieve GPS Sporen** | Heatmap | Wereldwijd | Global GPS traces heatmap (frequentie van bewandelde paden). |
| **RainViewer Buienradar** | Weer | Wereldwijd | Geanimeerde neerslagradar met live afspeellagen. |
| **Blitzortung Bliksem** | Weer | Wereldwijd | Live blikseminslagen en onweersactiviteit op de kaart. |
| **Natura 2000 Natuurbescherming** | Natuur | Europa (EU) | Officiële grenzen van beschermde Europese natuurgebieden (PDOK WMS). |
| **Rijksmonumenten Register** | Cultuur | Nederland | Alle geregistreerde Nederlandse rijksmonumenten als rode stippen (PDOK WMS). |
| **NASA VIIRS Lichtvervuiling** | Nachtkaart | Wereldwijd | Kunstmatige nachtverlichting en dark-sky zones voor sterrenkijken. |

---

## 3. 🔌 Geïntegreerde API's & Services

### 3.1 Dashboard, Weer & Noodlocatie
- **Open-Meteo API**: Live temperatuur, wind- en weersomstandigheden op de actuele kaartpositie.
- **Sunrise-Sunset API**: Exacte zonsopgang- en zonsondergangstijden op de huidige locatie.
- **WAQI (World Air Quality Index)**: Live meetgegevens van luchtkwaliteitsstations in de buurt (AQI index).
- **Google Plus Codes (Open Location Code)**: Korte 8-character noodcode voor snelle communicatie met hulpdiensten.
- **USGS / Open-Elevation API**: Verificatie en correctie van hoogtegegevens op basis van digitale terreinmodellen (DEM).
- **what3words API**: Optionele 3-woorden adressering voor exacte locatieaanduiding (3x3m grid).

### 3.2 Kamperen, Overnachten & Verhuur
- **OpenCampingMap**: Laadt campings, camperplaatsen en trekkershutten via OpenStreetMap.
- **VanStops UK**: Gespecialiseerde scanner voor camperplaatsen en pub stopovers in het Verenigd Koninkrijk.
- **Active Campsite Search API**: Camping- en caravanparken (Noord-Amerika dekking).
- **Rent-Camper API**: Live huurcamper catalogus met prijzen, faciliteiten (keuken, douche, bedden, A/C) en locaties op de kaart *(inclusief automatische fallback naar geïntegreerde catalogus)*.

### 3.3 Natuur, Geologie & Soorten
- **Gemini AI Vision API**: Analyseer foto's van flora/fauna met Google Gemini AI om soorten direct te identificeren.
- **GBIF (Global Biodiversity Information Facility)**: Raadpleeg waargenomen dier- en plantensoorten in het omringende gebied.
- **Xeno-Canto API**: Beluister live audio-opnames van vogelgeluiden die nabij de huidige locatie zijn opgenomen.
- **Macrostrat Geologie API**: Bepaal de geologische leeftijd en gesteentesamenstelling onder je voeten.

### 3.4 POI, Cultuur & Straatbeeld
- **Overpass API (OpenStreetMap)**: Live scanner in 4 hoofdcategorieën met viewport-ondersteuning:
  - 💧 *Drinkwaterpunten*
  - ⛺ *Campings & Bivakzones*
  - 🔭 *Uitzichtpunten & Bergtoppen*
  - 🚨 *Noodvoorzieningen & EHBO*
- **Toerisme Vlaanderen (Overpass)**: Erfgoed, kastelen en toeristische trekpleisters in Vlaanderen.
- **Wikipedia Geosearch API**: Vind nabijgelegen Wikipedia-artikelen met samenvattingen op de kaart.
- **iNaturalist API**: Bekijk foto's en waarnemingen van de biologische community rondom het kaartcentrum.
- **Mapillary API**: Geïntegreerde knop om direct 360°/street-level foto's in de omgeving van de kaart te openen.

### 3.5 Navigatie & Routenopping
- **BRouter Engine**: Snapping van wandel- en fietslijnen op de kaart met profielen:
  - *Trekking* (Standaard wandelroutes)
  - *Hiking* (Berg- en onverharde paden)
  - *Fastbike* (Verharde snelle fietsroutes)
  - *MTB* (Onverharde mountainbike paden)
  - *Straight* (Rechte hemelsbrede lijnen)
- **OpenRouteService (ORS) Isochronen**: Berekent het exacte wandelbereik (isochroon van 30 min) rond een gekozen punt.

### 3.6 Cloud & Multi-User Sync
- **Firebase Authentication**: Gebruikersregistratie en inloggen voor cloud-synchronisatie.
- **Cloud Firestore**: Veilig bewaren en synchroniseren van eigen waypoints en opgenomen GPX-tracks.
- **Firebase Live Beacon Share**: Deel je live wandelpositie via een unieke deel-URL met vrienden of thuisfront.

---

## 4. 🧰 API-Toolbox Configurator

Via de knop **🧰 Beheer Actieve API Toolbox** in het instellingenmenu kunnen gebruikers specifieke API's in- of uitschakelen om:
- Batterijverbruik te verminderen op lange tochten.
- Mobiel datagebruik te minimaliseren in het buitenland.
- De interface overzichtelijk te houden voor specifieke activiteiten.

---

## 5. 📋 Backlog & Toekomstige Functionaliteiten

Onderstaande features staan op de roadmap voor toekomstige releases van GeoForge Navigator:

### 🚵 Navigatie & Routetools
- [ ] **3D Hoogteprofiel Grafiek**: Visualisatie van stijging/daling langs getekende BRouter routes.
- [ ] **AllTrails & Komoot Import/Export Connector**: Directe synchronisatie van GPX-bestanden met populaire wandelplatforms.
- [ ] **Strava & Garmin Connect Export**: Automatische upload van opgenomen GPX-tracks na het beëindigen van een opname.
- [ ] **Offline BRouter Engine (WebAssembly / Local WASM Worker)**: Routes plannen via paden, zelfs zonder mobiel internet bereik.

### 📴 Offline Kaarten & Performance
- [ ] **MapLibre PMTiles Caching**: Eén-klik offline downloaden van volledige topografische regionale kaarten voor bergsport.
- [ ] **Offline Tile Storage**: Lokaal opslaan van gekozen kaarttegels in IndexedDB.

### 🚨 Veiligheid & Noodvoorzieningen
- [ ] **1-Klik SOS SMS Generateur**: Automatisch een SMS klaarzetten met exact 3-woorden adres, Plus Code en Google Maps link voor noodsituaties.
- [ ] **Offline Kompas & Peiling Tool**: Peilen van richtingen naar bekende bergentoppen/landmarks op de kaart.

### 👥 Social & Community
- [ ] **Live Groeps-Tracking**: Meerdere wandelgenoten tegelijk live volgen op 1 gezamenlijke kaart.
- [ ] **Mapillary In-App Modal Viewer**: Bekijk straatbeeldfoto's rechtstreeks in een zwevend venster binnen GeoForge i.p.v. een nieuw tabblad.
- [ ] **Geocaching API Integratie**: Toon actieve caches en schatten langs de geplande wandelroute.
