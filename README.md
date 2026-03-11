# Battletanks

![Splash Screen](splashscreen.png)

A browser-based, real-time 2D tank artillery game with destructible terrain, wind physics, and crazy surprises falling from the sky!

## Gameplay

The goal is dead simple: destroy the enemy tank! To accomplish this, you'll need to factor in the terrain, wind direction, and bonuses dropping from the sky.

- **Destructible Terrain:** Every projectile and bomb blows a crater in the ground. However, there is an indestructible bedrock layer at the very bottom of the map, preventing tanks from falling out of the arena. They can continue fighting from this solid ground. Tanks cannot climb steep crater walls.
- **Wind:** At the start of every round, a new, random wind strength and direction (Wind) is generated. This wind exerts a continuous horizontal force on flying projectiles (deflecting them) and slowly descending care packages throughout the round.
- **Fuel:** Every tank has limited fuel (indicated by a horizontal bar). You can still aim and shoot when out of fuel, but your tank won't be able to move an inch.

## Airplanes ✈️

In the heat of battle, airplanes will periodically fly across the sky! These planes will drop their payload at a random point over the map, which can be one of two things:
1. **Bomb 💣:** Behaves exactly like a fired tank projectile. It causes terrible destruction, blows a crater, and damages anyone nearby. The AI player will try to flee from it.
2. **Care Package (White box with a red cross) 🎁:** Descends on a parachute (making it more susceptible to wind). If anyone (you or the AI) touches it, they pick it up. The AI will drop everything it's doing and rush for the package! Picking it up grants one of the following random bonuses:
   - *Invulnerability (Shield):* A blue forcefield surrounds the tank for 10-15 seconds. Neither direct hits nor explosions will deal damage.
   - *Machine Gun Mode:* For 5 seconds, you can fire a continuous stream of bullets (like a machine gun) by holding down the fire button, bypassing cooldowns and power charging!

**TIP:** You can shoot down airplanes! If a projectile hits them, they will crash down in the direction they were flying. Upon impact, they cause a huge explosion that blows a crater and deals damage just like a bomb. If an airplane is carrying a care package, it will instantly drop it the moment it gets hit!

## Game Modes and Controls

The game starts in **1-Player (Human vs. AI)** mode by default. The CPU player will try to run away from bombers and rush for packages while targeting you!

### Player 1 (Black Tank) Controls:
- **`←` / `→` (Left/Right arrow):** Move tank (while fuel lasts)
- **`↑` / `↓` (Up/Down arrow):** Adjust turret aiming angle
- **`Space`:** Fire. **Hold down** to increase shot power, then **release** to fire!

---

As soon as anyone presses the **W, A, S, D**, or **Q** keys on the keyboard, the game overrides the CPU control and instantly switches to **2-Player (Local co-op)** mode! Win counters will reset, and you can battle it out on a clean slate.

### Player 2 (Red Tank) Controls:
- **`A` / `D`:** Move tank
- **`W` / `S`:** Aim (Turret up/down)
- **`Q`:** Fire. (Hold and release hotkey, functioning similarly to Player 1's Spacebar)

### Game Over (Restarting):
When a round ends, in addition to clicking the "Play Again" button, you can immediately start a new round by pressing the **`Enter`** key.
