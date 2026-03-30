# Strava Challenge Tracker

Aplikacja webowa do śledzenia postępów w miesięcznych firmowych wyzwaniach sportowych (np. Strava workplace challenges). Pozwala definiować eventy z progami minutowymi i punktowymi, dodawać aktywności oraz monitorować postęp na pasku graficznym.

## Wymagania

- Python 3.7+

Brak zewnętrznych zależności - aplikacja korzysta wyłącznie ze standardowej biblioteki Pythona.

## Uruchomienie

1. Sklonuj lub pobierz repozytorium.

2. Uruchom serwer:

```bash
python server.py
```

3. Otwórz przeglądarkę pod adresem:

```
http://localhost:3001
```

## Struktura plików

```
├── index.html       # Główna aplikacja (HTML + CSS + JS w jednym pliku)
├── server.py        # Serwer Python (API + serwowanie plików statycznych)
├── data.json        # Dane aplikacji (tworzony automatycznie)
└── README.md
```

## Funkcje

- Tworzenie eventów z datami i progami (minuty -> punkty)
- Dodawanie aktywności (bieganie, rower, spacer, inne) z czasem w formacie gg:mm:ss
- Pasek postępu z oznaczeniami progów
- Filtrowanie aktywności po okresie eventu
- Eksport/import eventów i aktywności jako JSON
- Czyszczenie danych z poziomu ustawień

## Dane

Dane są przechowywane w pliku `data.json` w katalogu aplikacji. Plik jest tworzony automatycznie przy pierwszym uruchomieniu.

## Autor

Oliwier Baran
