# Table rules

Ludo has a stable core—race four pieces from the yard, around the track, and
home—but published rule sets differ on many details. This game makes the most
common disagreements explicit before a room starts instead of presenting one
house style as universally official.

## Research summary

- [Party Ludo's rulebook](https://www.partyludo.com/ludo-rules) describes a
  six to enter, a bonus roll on six, a third-six penalty, safe squares, and an
  exact finish. It identifies blockades and capture-before-home as common house
  variations.
- [Ludo Ghar's table rules](https://www.ludoghar.co/pages/rules) use capture
  and six bonuses, blockades, safe squares, an exact finish, and a capture
  requirement before home. Its competitive option removes the capture bonus.
- [PlayJoy's Ludo rules](https://playjoy.com/en/ludo/rules/) demonstrate how
  substantially a published variant can differ: two dice, entry on a total of
  five, doubles, barriers, and fixed movement bonuses after captures and homes.
- [The regional-variations overview](https://en.wikipedia.org/wiki/Ludo#Differences)
  documents entry on one or six, three attempts to enter, passable blocks,
  capture/home bonuses, two-dice and backward-movement variants, star jumps,
  and capture-before-home play.

Team play, backward movement, paired dice totals, and star-to-star jumps change
the shape of the game enough to be separate modes. The room picker concentrates
on rules that remain understandable as independent table options.

## Implemented options

| Option | Exact behavior in this game |
| --- | --- |
| Dice per turn | Roll 1–4 dice together. Spend every usable die in any order, on the same or different pieces. A bonus roll is queued until the tray is resolved. |
| Need a 6 to enter | A yard piece can only reach its starting square with a 6. When off, any die can enter a piece and that entire die is consumed. |
| Three entry attempts | When every unfinished piece is in the yard, the player gets up to three tray rolls to find a 6. |
| Extra roll after a 6 | Using a 6 queues another complete tray after the remaining dice are spent. |
| Third 6 ends the turn | The third consecutive 6 cannot be used; all unspent dice are discarded and play passes. With multiple dice, left-to-right tray order determines consecutiveness. |
| Extra roll after a capture | A capture queues another complete tray. |
| Extra roll after reaching home | Finishing one piece queues another complete tray. |
| Protected safe squares | Opponents on stars and coloured starting squares cannot be captured. |
| Blockades | Two same-colour pieces prevent opponents from landing on or passing their square. |
| Capture before home | None of a player's pieces may enter the home lane until that player has captured at least once. |
| Exact roll to finish | An oversized die cannot move that piece. When off, an oversized die finishes it. |

Rules are locked when the host starts the match, copied into authoritative game
state, included in replay frames, and visible to every player during play.
