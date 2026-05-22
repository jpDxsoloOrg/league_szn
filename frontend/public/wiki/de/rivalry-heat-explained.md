# Wie Rivalitäts-Hitze funktioniert

Die Hitze einer Rivalität reagiert darauf, wie ihre Kämpfe bewertet werden. Je heißer eine Rivalität, desto sichtbarer ist sie auf dem Hub und dem Dashboard.

## Die fünf Stufen

| Stufe          | Stimmung                                       |
|----------------|------------------------------------------------|
| Eiskalt        | Pures Gift — nichts will klappen               |
| Kalt           | Unterdurchschnittliche Kämpfe                  |
| Warm           | Der Standard; Kämpfe sind weitgehend okay      |
| Heiß           | Ein ★★★★-Knaller nach dem anderen              |
| Glühend heiß   | Stoff für die Ewigkeit. Match of the Year      |

## Die Formel (für die Neugierigen)

Jeder bewertete Kampf in einer Rivalität trägt Punkte zum Hitze-Wert bei:

`Beitrag = (Kampf-Durchschnitt − 2,5) × Gewicht`

wobei `Gewicht = min(Anzahl Bewertungen, 5)`. Die 2,5 ist der neutrale Drehpunkt — ein Kampf mit genau 2,5 Sternen verändert die Hitze nicht. Höhere Bewertungen erhöhen die Hitze; niedrigere senken sie.

Die Summe wird auf `[−100, +100]` begrenzt und einer Stufe zugeordnet:

| Wertebereich   | Stufe        |
|----------------|--------------|
| ≥ +60          | Glühend heiß |
| +20 … +59      | Heiß         |
| −19 … +19      | Warm         |
| −59 … −20      | Kalt         |
| ≤ −60          | Eiskalt      |

Die Werte sind in `backend/lib/policies/rivalryHeat.ts` einstellbar — bitte melde einen Bug im GM-Channel, falls sich die Schwellenwerte falsch anfühlen.

## Hinweise für Admins

Admins können die Hitze einer Rivalität im Bereich Admin → Rivalitäten manuell überschreiben. Die nächste Nutzerbewertung eines Kampfes dieser Rivalität berechnet die Hitze von Grund auf neu und überschreibt jeden manuellen Wert. Mit der Schaltfläche „Aus Bewertungen neu berechnen" lässt sich dies ohne Wartezeit erzwingen.
