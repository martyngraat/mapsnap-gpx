# GeoForge Navigator: Modular API Registry Architecture

Dit document beschrijft de architectuur van de modulaire API-toolbox van GeoForge Navigator. Dit systeem stelt gebruikers in staat om specifieke locatie-gerelateerde API-modules aan of uit te zetten via het **Configuratiescherm**, waardoor de app overzichtelijk en performant blijft, ongeacht het aantal API's dat we toevoegen.

---

## 🏗️ Het Register (`API_REGISTRY`)

Alle API's en dekkingsgegevens in de app zijn gedefinieerd in een centraal register genaamd `API_REGISTRY` in `app.js`. Dit object dient als de "Single Source of Truth".

Elke module in het register bevat:
- `name`: De weergavenaam in het configuratiescherm.
- `category`: De groep waaronder de API valt (bijv. "Dashboard & Weer", "Kaart Overlays", "Natuur & Bodem", "POI & Route", "Kamperen & Overnachten").
- `description`: Uitleg voor de gebruiker over wat de API doet.
- `coverage`: Het dekkingsgebied van de API (bijv. `'Wereldwijd'`, `'Europa'`, `'Nederland'`, `'Noorwegen'`, `'Vlaanderen'`, `'Noord-Amerika'`).
- `default`: Of de API standaard is ingeschakeld bij de eerste lancering.

### Voorbeeld Registratie:
```javascript
const API_REGISTRY = {
  'open_meteo': {
    name: 'Open-Meteo Weer',
    category: 'Dashboard & Weer',
    description: 'Laadt actuele weersinformatie en temperaturen op je huidige locatie.',
    coverage: 'Wereldwijd',
    default: true
  },
  'natura2000': {
    name: 'Natura 2000 Natuurbescherming (EU)',
    category: 'Kaart Overlays',
    description: 'Toont de begrenzingen van Natura 2000 beschermde natuurgebieden in Europa.',
    coverage: 'Europa',
    default: true
  }
};
```

---

## 🎨 UI Koppeling via `data-api`

De interface elementen die bij een specifieke API horen, worden in `index.html` gemarkeerd met het attribuut `data-api="[api_id]"`.

### Voorbeeld in HTML:
```html
<!-- De weersinformatie cell wordt verborgen als Open-Meteo is uitgeschakeld -->
<div class="info-cell api-module-ui" data-api="open_meteo">
  <span class="info-cell-label">🌦️ Weersverwachting</span>
  <span class="info-cell-value" id="info-weather">Laden...</span>
</div>
```

Wanneer de gebruiker een API uitschakelt in het configuratiescherm:
1. Wordt de voorkeur opgeslagen in `localStorage` onder `geoforge_api_disabled_[api_id]`.
2. Zoekt de app alle elementen met `data-api="[api_id]"` op en voegt de class `hidden` toe.
3. Eventuele netwerkverzoeken voor deze API worden automatisch overgeslagen om data en batterij te besparen.

---

## 🚀 Handleiding: Een nieuwe API toevoegen (voor Ontwikkelaars)

Als we als ontwikkelaars een nieuwe locatie-gerelateerde API willen toevoegen, volgen we deze 4 stappen:

### Stap 1: Registreren in `app.js`
Voeg de nieuwe API-sleutel toe aan `API_REGISTRY` met bijbehorende metadata en dekkingsgegevens:
```javascript
'nieuwe_api': {
  name: 'Mijn Nieuwe Locatie API',
  category: 'Natuur & Bodem', // Keuze uit: 'Dashboard & Weer', 'Kaart Overlays', 'Natuur & Bodem', 'POI & Route', 'Kamperen & Overnachten'
  description: 'Haalt supergave locatiegegevens op.',
  coverage: 'Wereldwijd',
  default: true
}
```

### Stap 2: Elementen toevoegen aan `index.html`
Plaats de gewenste HTML-weergave elementen in het juiste paneel en geef ze de attributen `class="api-module-ui"` en `data-api="nieuwe_api"`:
```html
<div class="api-module-ui" data-api="nieuwe_api">
  <h4>Mijn Nieuwe Gegevens</h4>
  <p id="info-nieuwe-data">Laden...</p>
</div>
```

### Stap 3: Logica conditioneel maken in `app.js`
Zorg ervoor dat je netwerkverzoek of kaartlaag-initialisatie alleen wordt uitgevoerd als de API is ingeschakeld met behulp van de helper-methode `isApiEnabled('nieuwe_api')`:

```javascript
function fetchNieuweApiGegevens() {
  if (!isApiEnabled('nieuwe_api')) return; // Sla de API over als deze uit staat!
  
  // Voer hier de API fetch uit...
}
```

### Stap 4: Initialiseren en Testen
Het configuratiescherm bouwt zichzelf automatisch op bij het opstarten aan de hand van `API_REGISTRY`. De nieuwe optie verschijnt direct in de lijst van de gebruiker!
