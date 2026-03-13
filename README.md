# Battletanks

![Splash Screen](splashscreen.png)

A browser-based, real-time 2D tank artillery game with destructible terrain, wind physics, and crazy surprises falling from the sky!

## Gameplay

The goal is dead simple: destroy the enemy tank! To accomplish this, you'll need to factor in the terrain, wind direction, and bonuses dropping from the sky.

- **Random Themes:** Every round takes place in one of four environments: Day (green grass, blue sky), Desert (sandy dunes, warm sky), Night (rocky ground, starry sky), or Snow (dirty white ground, falling snow).
- **Destructible Terrain:** Every projectile and bomb blows a crater in the ground. However, there is an indestructible bedrock layer at the very bottom of the map, preventing tanks from falling out of the arena. They can continue fighting from this solid ground. Tanks cannot climb steep crater walls.
- **Wind:** At the start of every round, a new, random wind strength and direction (Wind) is generated. This wind exerts a continuous horizontal force on flying projectiles (deflecting them) and slowly descending care packages throughout the round.
- **Fuel:** Every tank has limited fuel (indicated by a horizontal bar). You can still aim and shoot when out of fuel, but your tank won't be able to move an inch.

## Aircrafts & Payloads ✈️🚁

In the heat of battle, aircraft will periodically fly across the sky and drop payloads at random points over the map. There are two types of aircraft:
1. **Bombers (Gray Airplanes):** These drop weapons like bombs or landmines.
2. **Helicopters (Yellow):** These fly in to deliver helpful supplies like care packages or fuel.

The payloads can be one of four things:
1. **Bomb 💣:** Behaves exactly like a fired tank projectile. It causes terrible destruction, blows a crater, and damages anyone nearby. The AI player will try to flee from it.
2. **Landmine 🔴:** A small explosive that lands on the ground without exploding immediately. It blinks with a red light and waits. If any tank drives too close to it, it explodes, dealing half the damage of a direct hit but with a smaller 40% explosion radius.
3. **Care Package 🎁:** Descends on a parachute (making it more susceptible to wind). If anyone (you or the AI) touches it, they pick it up. The AI will drop everything it's doing and rush for the package! Picking it up grants one of the following random bonuses:
   - *Shield:* A glowing purple aura surrounds the tank for 15 seconds. Incoming damage is reduced by 50% initially, but this protection scales down to 0% as the 15 seconds run out.
   - *Machine Gun Mode:* For 5 seconds, you can fire a continuous stream of bullets (like a machine gun) by holding down the fire button, bypassing cooldowns and power charging!
4. **Fuel Drop ⛽:** Instantly restores 20% of your maximum fuel capacity.

**TIP:** You can shoot down aircraft! If a projectile hits them, they will crash down in the direction they were flying. Upon impact, they cause a huge explosion that blows a crater and deals damage just like a bomb. If they are carrying a support package, they will instantly drop it the moment they get hit!

## Game Modes and Controls

The game starts in **1-Player (Human vs. AI)** mode by default. The CPU player will try to run away from bombers and rush for packages while targeting you!

### Player 1 (Light Gray Tank) Controls:
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
