# Strava Challenge Tracker

Aplikacja desktopowa do sledzenia postepow w miesiecznych firmowych wyzwaniach sportowych (np. Strava workplace challenges). Pozwala definiowac eventy z progami minutowymi i punktowymi, dodawac aktywnosci oraz monitorowac postep na pasku graficznym.

## Pobieranie

Gotowy installer Windows (.exe) dostepny w zakladce [Releases](https://github.com/oliwier93/strava-challenge-tracker/releases).

## Uruchomienie z kodu zrodlowego

### Wymagania

- Python 3.7+
- Node.js 18+ (do budowania aplikacji desktopowej)

### Tryb przegladarkowy (bez Electrona)

```bash
python server.py
```

Otworz przegladarke: `http://localhost:3001`

### Tryb desktopowy (Electron)

```bash
npm install
npm start
```

### Budowanie installera Windows

```bash
npm install
npm run build
```

Installer pojawi sie w folderze `dist/`.

> **Uwaga:** Zbudowana aplikacja wymaga Pythona zainstalowanego na maszynie docelowej.

## Struktura plikow

```
├── index.html       # Glowna aplikacja (HTML + CSS + JS w jednym pliku)
├── server.py        # Serwer Python (API + serwowanie plikow statycznych)
├── main.js          # Proces glowny Electron
├── build-icon.js    # Skrypt wstrzykujacy ikone do .exe
├── create_icon.py   # Generator ikony aplikacji
├── icon.ico         # Ikona aplikacji
├── package.json     # Konfiguracja Node.js / Electron / electron-builder
├── data.json        # Dane aplikacji (tworzony automatycznie, nie w repo)
└── README.md
```

## Funkcje

- Tworzenie eventow z datami i progami (minuty -> punkty)
- Dodawanie aktywnosci (bieganie, rower, spacer, inne) z czasem w formacie gg:mm:ss
- Pasek postepu z oznaczeniami progow
- Filtrowanie aktywnosci po okresie eventu
- Eksport/import eventow i aktywnosci jako JSON
- Czyszczenie danych z poziomu ustawien
- Natywna aplikacja desktopowa (Electron) z instalatorem Windows

## Dane

Dane sa przechowywane w pliku `data.json` w katalogu aplikacji. Plik jest tworzony automatycznie przy pierwszym uruchomieniu.

## Autor

Oliwier Baran
