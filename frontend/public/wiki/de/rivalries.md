# Rivalitäten

Eine **Rivalität** ist eine längere Storyline zwischen zwei Wrestlern. Anders als eine einzelne Challenge erstreckt sich eine Rivalität über mehrere Matches und Storyline-Wochen. Der Rivalitäten-Hub unter `/rivalries` ist die Heimat jeder aktiven, archivierten oder pendenten Rivalität in der Liga.

## Rivalität vs. Challenge

| | Rivalität | Challenge |
|---|---|---|
| **Laufzeit** | Wochen → Monate | Stunden → Tage |
| **Freigabe** | GM-Prüfung erforderlich | Wrestler-zu-Wrestler |
| **Was sie nachhält** | Matches, Promos, Notizen, Nachrichten | ein anstehendes Match |
| **Wann nutzen** | Mehrere-Match-Storyline | Ein einzelnes Ad-hoc-Match |

Für ein einmaliges Match: starte eine **Challenge**. Für einen wiederkehrenden Konflikt mit Character-Beats und späterem Payoff-Match: öffne eine **Rivalität**.

## Rivalität anfragen

1. Vom Hub aus klicke den goldenen Button **Rivalität anfragen**.
2. **Schritt 1 — Wer & Warum:** Wähle deinen Gegner per Autocomplete, vergib einen Titel, wähle eine Anfangshitze (siehe unten) und schreibe einen 50–1500 Zeichen langen Pitch.
3. **Schritt 2 — Pitch & Pläne:** Schreibe eine 100–3000 Zeichen lange Storyline und optional bis zu 5 Plan-Beats mit Zieldatum (diese werden als **Plan-Notizen** angelegt, standardmäßig nur für GMs sichtbar).
4. Absenden. Ein GM prüft den Antrag innerhalb weniger Tage.

## Hitzestufen

Die Hitze-Anzeige sagt dem Locker Room, wie heiß die Storyline ist. Wähle die Stufe, die zu deinem Pitch passt — GMs können sie nach der Freigabe noch anpassen.

| Hitze | Wann nutzen |
|---|---|
| **Schwelend** | Geschichte baut sich auf, Matches sind sporadisch |
| **Brodelnd** | regelmäßige Character-Arbeit, noch kein Payoff |
| **Hitzig** | aktive Main-Event-Fehde |

## Nachrichten

Der Nachrichten-Tab auf der Detail-Seite einer Rivalität ist der private Backchannel zwischen dir, deinem Gegner und den GMs:

- **Gegner einbeziehen** (Toggle in der linken Spalte): wenn **aus**, sehen nur die GMs deine Nachrichten — ein "Mit dem Booker reden"-Kanal. Wenn **an**, sieht auch der gegnerische Wrestler die Nachrichten — der "Trash Talk unter uns"-Kanal.
- Du kannst die Audience auch pro Nachricht im Composer überschreiben.
- 🔒 markiert eine GM-Only-Nachricht; dein Gegner sieht sie nicht.
- Der Thread aktualisiert sich alle 15 Sekunden, solange der Tab geöffnet ist; gesendete Nachrichten erscheinen sofort dank Optimistic UI.

## Nach dem Absenden

Dein Antrag landet in der Pending-Warteschlange unter `/admin/rivalries`. Die GMs sehen ihn und:

- **Genehmigen** → Status wird `active`, du bekommst eine Benachrichtigung, die Rivalität erscheint im Hub.
- **Ablehnen** → du bekommst eine Benachrichtigung mit dem Grund. Du kannst eine andere Rivalität anfragen.
- **Abschließen** (später) → die Rivalität wandert ins **Archiv** im Hub.

## Matches und Promos mit Rivalitäten verknüpfen

Wenn ein GM ein Match zwischen den Rivalitäts-Teilnehmern ansetzt, kann er es mit der Rivalität verknüpfen — das Match erscheint dann im Kampfhistorie- oder Zukünftige-Kämpfe-Tab. Auch Promos der Teilnehmer können verknüpft werden, damit die Storyline-Beats an einem Ort bleiben.

Wenn ein Match noch nicht im Detail erscheint, ist es vielleicht einfach nicht verknüpft — bitte den GM, es zuzuordnen.

## Siehe auch

- [Promos](/guide/wiki/promos)
- [Challenges](/guide/wiki/challenges)
- [Events](/guide/wiki/events)
