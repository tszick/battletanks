/**
 * Main Game Logic for Tank Battle
 */
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    playTone(freq, type, duration, vol = 0.1, slideFreq = null) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideFreq) osc.frequency.exponentialRampToValueAtTime(slideFreq, this.ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol = 0.2) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        const gain = this.ctx.createGain();
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.start();
    }

    shoot() { this.playTone(600, 'square', 0.2, 0.1, 100); }
    explosion() {
        this.playNoise(0.5, 0.4);
        this.playTone(150, 'sawtooth', 0.5, 0.2, 20);
    }
    bombDrop() { this.playTone(800, 'sine', 1.0, 0.1, 100); }
    victory() {
        [440, 554, 659, 880].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 'square', 0.2, 0.1), i * 150);
        });
    }
    defeat() {
        [300, 250, 200, 150].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 'sawtooth', 0.3, 0.1), i * 250);
        });
    }
}

// -------------------------------------------------------------
// Assets & Image Processing
// -------------------------------------------------------------
class AssetManager {
    static sprites = {};
    
    static async loadAndProcessImage(name, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // Removed crossOrigin="Anonymous" to avoid issues with local file:// protocol
            img.onload = () => {
                try {
                    // Background removal (make white transparent)
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imgData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        // If pixel is near white (#ffffff), make fully transparent
                        if (r > 240 && g > 240 && b > 240) {
                            data[i + 3] = 0; // Alpha = 0
                        }
                    }
                    ctx.putImageData(imgData, 0, 0);
                    
                    const processedImg = new Image();
                    processedImg.src = canvas.toDataURL();
                    processedImg.onload = () => {
                        AssetManager.sprites[name] = processedImg;
                        resolve();
                    };
                } catch (err) {
                    console.warn("Could not process transparency (likely running via file:// without a web server). Using original image.", err);
                    AssetManager.sprites[name] = img;
                    resolve();
                }
            };
            img.onerror = () => {
                console.error("Failed to load image: " + path);
                resolve(); // Resolve anyway so Game continues to load procedural fallbacks
            };
            img.src = path;
        });
    }
    
    static async loadAll() {
        await Promise.all([
            AssetManager.loadAndProcessImage('gray_tank', './assets/gray_tank.png'),
            AssetManager.loadAndProcessImage('red_tank', './assets/red_tank.png'),
            AssetManager.loadAndProcessImage('gray_airplane', './assets/gray_airplane.png'),
            AssetManager.loadAndProcessImage('yellow_helicopter', './assets/yellow_helicopter.png')
        ]);
        console.log("All assets loaded and processed.");
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Global Game State (persists across rounds)
        this.playerScore = 0;
        this.enemyScore = 0;
        this.isTwoPlayerMode = false;

        // Round State
        this.lastTime = 0;
        this.isRunning = false;

        // Entities
        this.terrain = null;
        this.tanks = [];
        this.projectiles = [];
        this.explosions = [];
        this.carePackages = [];
        this.airplane = null;
        this.airplaneTimer = 0;

        // Input state
        this.keys = {};

        this.sounds = new SoundManager();

        // Bind events
        window.addEventListener('keydown', (e) => {
            if (!this.isRunning && document.getElementById('gameOver').style.display === 'block') {
                if (e.code === 'Enter') {
                    this.init();
                    return;
                }
            }
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Bind requestAnimationFrame context
        this.loop = this.loop.bind(this);
    }

    init() {
        document.getElementById('gameOver').style.display = 'none';

        // Select Random Theme
        const themes = ['day', 'desert', 'night', 'snow'];
        this.currentTheme = themes[Math.floor(Math.random() * themes.length)];

        // Generate stars for night theme, or snowflakes for snow theme
        this.stars = [];
        this.snowflakes = [];
        if (this.currentTheme === 'night') {
            for (let i = 0; i < 100; i++) {
                this.stars.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height * 0.8, // Most stars in the upper 80%
                    size: Math.random() * 2 + 0.5,
                    alpha: Math.random()
                });
            }
        } else if (this.currentTheme === 'snow') {
            for (let i = 0; i < 200; i++) {
                this.snowflakes.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    size: Math.random() * 2.5 + 1.0,
                    speed: Math.random() * 50 + 20, // vertical fall speed
                    swayPhase: Math.random() * Math.PI * 2
                });
            }
        }

        this.terrain = new Terrain(this.width, this.height, this.currentTheme);

        // Setup Player
        const playerX = 150;
        this.player = new Tank(playerX, this.terrain.getHeight(playerX), '#dddddd', true);

        // Setup Enemy
        const enemyX = this.width - 150;
        this.enemy = new Tank(enemyX, this.terrain.getHeight(enemyX), '#cc0000', false);
        this.ai = new AI(this.enemy, this.player, this.terrain);

        this.tanks = [this.player, this.enemy];
        this.projectiles = [];
        this.explosions = [];
        this.carePackages = [];
        this.mines = [];
        this.airplanes = [];
        this.airplaneTimer = Math.random() * 2.5 + 1.5; // 1.5 to 4 seconds
        this.wind = (Math.random() - 0.5) * 300; // Wind strength between -150 and 150

        this.isEnding = false;
        this.endingTimer = 0;

        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);

        document.getElementById('enemyName').innerText = 'CPU (Enemy)';
        document.getElementById('enemyPowerLabel').innerText = 'Power';

        this.updateUI();
    }

    loop(timestamp) {
        if (!this.isRunning) return;

        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.draw();

        requestAnimationFrame(this.loop);
    }

    update(dt) {
        if (this.isEnding) {
            this.endingTimer -= dt;

            // Spawn random explosions on dead tanks during ending
            this.tanks.forEach(tank => {
                if (tank.health <= 0 && Math.random() < 0.1) {
                    this.createExplosion(tank.x + (Math.random() - 0.5) * 40, tank.y - 10 + (Math.random() - 0.5) * 40, true);
                }
            });

            // Explosions continue to animate
            for (let i = this.explosions.length - 1; i >= 0; i--) {
                this.explosions[i].update(dt);
                if (this.explosions[i].isDead) {
                    this.explosions.splice(i, 1);
                }
            }

            if (this.endingTimer <= 0) {
                this.isRunning = false; // Stop game loop completely
            }
            return;
        }

        // Player Input
        if (this.keys['ArrowLeft']) this.player.move(-1, dt, this.terrain);
        if (this.keys['ArrowRight']) this.player.move(1, dt, this.terrain);
        if (this.keys['ArrowUp']) this.player.aim(1, dt);
        if (this.keys['ArrowDown']) this.player.aim(-1, dt);

        if (this.keys['Space']) {
            if (this.player.machineGunTime > 0) {
                this.fireProjectile(this.player, true);
            } else {
                this.player.chargePower(dt);
            }
        } else if (this.player.isCharging) {
            this.fireProjectile(this.player);
            this.player.isCharging = false;
        }

        // Detect 2-Player Mode activation (WASD or Q)
        if (!this.isTwoPlayerMode && (this.keys['KeyW'] || this.keys['KeyA'] || this.keys['KeyS'] || this.keys['KeyD'] || this.keys['KeyQ'])) {
            this.isTwoPlayerMode = true;
            this.playerScore = 0;
            this.enemyScore = 0;
            this.updateUI(); // Immediate UI update for the score reset
        }

        if (this.isTwoPlayerMode) {
            // Player 2 Input
            if (this.keys['KeyA']) this.enemy.move(-1, dt, this.terrain);
            if (this.keys['KeyD']) this.enemy.move(1, dt, this.terrain);
            if (this.keys['KeyW']) this.enemy.aim(1, dt);
            if (this.keys['KeyS']) this.enemy.aim(-1, dt);

            if (this.keys['KeyQ']) {
                if (this.enemy.machineGunTime > 0) {
                    this.fireProjectile(this.enemy, true);
                } else {
                    this.enemy.chargePower(dt);
                }
            } else if (this.enemy.isCharging) {
                this.fireProjectile(this.enemy);
                this.enemy.isCharging = false;
            }
        } else {
            // AI Logic
            this.ai.update(dt, this);
        }

        // Physics
        this.tanks.forEach(tank => tank.updatePhysics(dt, this.terrain));

        // Airplane Logic
        this.airplaneTimer -= dt;
        if (this.airplaneTimer <= 0) {
            this.spawnAirplane();
            this.airplaneTimer = Math.random() * 2.5 + 1.5; // Even more frequent 
        }

        for (let i = this.airplanes.length - 1; i >= 0; i--) {
            const plane = this.airplanes[i];
            plane.update(dt, this);
            if (plane.readyToRemove || plane.isOffScreen(this.width)) {
                this.airplanes.splice(i, 1);
            }
        }

        // Care Packages
        for (let i = this.carePackages.length - 1; i >= 0; i--) {
            const cp = this.carePackages[i];
            cp.update(dt, this.terrain, this.wind);

            this.tanks.forEach(tank => {
                const dist = Math.hypot(tank.x - cp.x, (tank.y - 10) - cp.y);
                if (dist < 30 && !cp.collected) {
                    cp.collected = true;
                    this.sounds.playTone(800, 'square', 0.2, 0.1, 1200); // Collect sound
                    if (cp.type === 'fuel') {
                        tank.fuel = Math.min(tank.maxFuel, tank.fuel + tank.maxFuel * 0.2);
                    } else if (cp.type === 'toolbox') {
                        tank.health = Math.min(100, tank.health + 10); // Heal 10% of 100 max health
                    } else {
                        if (Math.random() < 0.5) {
                            tank.invulnerableTime = 10 + Math.random() * 5; // 10-15s
                        } else {
                            tank.machineGunTime = 5; // 5s
                        }
                    }
                }
            });

            if (cp.collected) {
                this.carePackages.splice(i, 1);
            }
        }

        // Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this.wind);

            // Check collision with terrain
            if (p.y > this.terrain.getHeight(p.x)) {
                this.createExplosion(p.x, p.y);
                this.projectiles.splice(i, 1);
                continue;
            }

            // Check collision with airplanes
            let hitAirplane = false;
            for (let j = this.airplanes.length - 1; j >= 0; j--) {
                const plane = this.airplanes[j];
                // Don't collide with own bomb immediately
                if (p.owner === plane && p.lifeTime < 0.5) continue;

                if (!plane.isDead && Math.hypot(p.x - plane.x, p.y - plane.y) < 30) {
                    plane.takeDamage(this);
                    this.createExplosion(p.x, p.y);
                    this.projectiles.splice(i, 1);
                    hitAirplane = true;
                    break;
                }
            }
            if (hitAirplane) continue;

            // Bounds check
            if (p.x < 0 || p.x > this.width || p.y > this.height) {
                this.projectiles.splice(i, 1);
            }
        }

        // Update Snowflakes
        if (this.currentTheme === 'snow') {
            this.snowflakes.forEach(flake => {
                flake.y += flake.speed * dt;
                flake.x += (Math.sin(flake.swayPhase + flake.y / 50) * 20 + this.wind * 0.5) * dt;

                // Loop around when hitting bottom or going mostly offscreen horizontally
                if (flake.y > this.height) {
                    flake.y = -10;
                    flake.x = Math.random() * this.width;
                }
                if (flake.x > this.width + 20) flake.x = -10;
                else if (flake.x < -20) flake.x = this.width + 10;
            });
        }

        // Mines (Taposóakna)
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const mine = this.mines[i];
            mine.update(dt, this.terrain);

            if (mine.isLanded) {
                let triggered = false;
                this.tanks.forEach(tank => {
                    // Tank is approx 40 width. If distance from tank center X to mine X is < 20, and tank height is close.
                    if (Math.abs(tank.x - mine.x) < 20 && Math.abs(tank.y - mine.y) < 20) {
                        triggered = true;
                    }
                });

                if (triggered) {
                    // 40% scale for visual explosion crater, 50% flat damage (12.5 total) 
                    this.createExplosion(mine.x, mine.y, false, 0.4, 0.5); 
                    this.mines.splice(i, 1);
                }
            }
        }

        // Explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            this.explosions[i].update(dt);
            if (this.explosions[i].isDead) {
                this.explosions.splice(i, 1);
            }
        }

        this.updateUI();
        this.checkWinCondition();
    }

    fireProjectile(tank, isMachineGun = false) {
        if (tank.cooldown > 0 && !isMachineGun) return;
        if (isMachineGun && tank.machineGunCooldown > 0) return;

        const muzzleX = tank.x + Math.cos(tank.angle) * tank.barrelLength;
        const muzzleY = tank.y - 10 + Math.sin(tank.angle) * tank.barrelLength;

        const powerToUse = isMachineGun ? 100 : tank.power;
        const vx = Math.cos(tank.angle) * powerToUse * 8; // scale power to velocity
        const vy = Math.sin(tank.angle) * powerToUse * 8;

        this.projectiles.push(new Projectile(muzzleX, muzzleY, vx, vy));
        this.sounds.shoot();

        if (isMachineGun) {
            tank.machineGunCooldown = 0.1; // 10 shots/sec
        } else {
            tank.power = 0;
            tank.cooldown = 0.5; // half second cooldown
        }
    }

    createExplosion(x, y, isSmall = false, radiusScale = 1.0, damageScale = null) {
        this.sounds.explosion();
        const baseRadius = isSmall ? 25 : 50;
        const radius = baseRadius * radiusScale;
        this.explosions.push(new Explosion(x, y, radius));
        this.terrain.destroyCircle(x, y, radius);

        // Damage calculations
        const actualDamageScale = damageScale !== null ? damageScale : radiusScale;
        const maxDamage = 25 * actualDamageScale;

        this.tanks.forEach(tank => {
            const dist = Math.hypot(tank.x - x, (tank.y - 10) - y); // approx tank center

            // Expand the hit radius for mines so it guarantees the triggering tank takes damage 
            // even if its center is slightly outside the visual 40% crater.
            const hitRadius = damageScale !== null ? Math.max(radius, 35) : radius;

            if (dist < hitRadius) {
                // If this is a mine explosion (damageScale is explicitly set), deal flat damage regardless of distance.
                // Otherwise calculate falloff based on radius.
                if (damageScale !== null) {
                    tank.takeDamage(maxDamage);
                } else if (dist < radius * 0.5) {
                    tank.takeDamage(maxDamage);
                } else {
                    // Scale damage: edge of explosion = minor damage, closer = more
                    const damage = maxDamage * (1 - (dist / radius));
                    tank.takeDamage(damage);
                }
            }
        });
    }

    spawnAirplane() {
        this.airplanes.push(new Airplane(this.width, this.height));
    }

    updateUI() {
        document.getElementById('playerHealth').style.width = Math.max(0, this.player.health) + '%';
        document.getElementById('enemyHealth').style.width = Math.max(0, this.enemy.health) + '%';

        const powerPercent = (this.player.power / 100) * 100;
        document.getElementById('playerPower').style.width = powerPercent + '%';

        const enemyPowerPercent = (this.enemy.power / 100) * 100;
        document.getElementById('enemyPower').style.width = enemyPowerPercent + '%';

        // Update Scores and Wind
        document.getElementById('playerScoreDisplay').innerText = this.playerScore;
        document.getElementById('enemyScoreDisplay').innerText = this.enemyScore;

        // Update Fuel Bars
        if (this.player && this.enemy) {
            document.getElementById('playerFuel').style.width = Math.max(0, (this.player.fuel / this.player.maxFuel * 100)) + '%';
            document.getElementById('enemyFuel').style.width = Math.max(0, (this.enemy.fuel / this.enemy.maxFuel * 100)) + '%';
        }

        let windMag = Math.round(Math.abs(this.wind));
        let windDir = this.wind > 0 ? "→" : (this.wind < 0 ? "←" : "");
        let windDisplay = document.getElementById('windDisplay');
        if (windDisplay) {
            windDisplay.innerText = `${windDir} ${windMag} 💨`;
        }

        if (this.isTwoPlayerMode) {
            document.getElementById('enemyName').innerText = 'Player 2 (Red)';
            document.getElementById('enemyPowerLabel').innerText = 'Power (Hold Q)';
        }
    }

    checkWinCondition() {
        if (!this.isEnding && (this.player.health <= 0 || this.enemy.health <= 0)) {
            this.isEnding = true;
            this.endingTimer = 3.0; // 3 seconds of explosions

            // Big initial explosion on the loser
            if (this.player.health <= 0) this.createExplosion(this.player.x, this.player.y);
            if (this.enemy.health <= 0) this.createExplosion(this.enemy.x, this.enemy.y);

            this.showGameOverScreen(); // Show immediately!
        }
    }

    showGameOverScreen() {
        const gameOverDiv = document.getElementById('gameOver');
        const winnerText = document.getElementById('winnerText');

        gameOverDiv.style.display = 'block';
        if (this.player.health <= 0 && this.enemy.health <= 0) {
            winnerText.innerText = "Draw!";
            winnerText.style.color = 'white';
            this.sounds.defeat();
        } else if (this.enemy.health <= 0) {
            winnerText.innerText = "Player 1 Wins!";
            winnerText.style.color = '#4CAF50';
            this.playerScore++;
            this.sounds.victory();
        } else {
            winnerText.innerText = this.isTwoPlayerMode ? "Player 2 Wins!" : "CPU Wins!";
            winnerText.style.color = '#ff5555';
            this.enemyScore++;
            this.sounds.defeat();
        }
        this.updateUI(); // Final score update
    }

    draw() {
        // Draw sky gradient based on theme
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        
        if (this.currentTheme === 'day') {
            skyGradient.addColorStop(0, '#1E90FF'); // Darker sky blue at the top
            skyGradient.addColorStop(1, '#FFFFFF'); // White at the bottom
            this.ctx.fillStyle = skyGradient;
            this.ctx.fillRect(0, 0, this.width, this.height);
        } else if (this.currentTheme === 'desert') {
            skyGradient.addColorStop(0, '#F4A460'); // Sandy brown at top
            skyGradient.addColorStop(1, '#FFFACD'); // Lemon chiffon / white-yellow at bottom
            this.ctx.fillStyle = skyGradient;
            this.ctx.fillRect(0, 0, this.width, this.height);
        } else if (this.currentTheme === 'night') {
            skyGradient.addColorStop(0, '#000011'); // Very dark blue/black at top
            skyGradient.addColorStop(1, '#1a1a2e'); // Dark blue at bottom
            this.ctx.fillStyle = skyGradient;
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Draw stars for night theme
            this.stars.forEach(star => {
                this.ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
        } else if (this.currentTheme === 'snow') {
            skyGradient.addColorStop(0, '#A9B0B3'); // Light gray sky at top
            skyGradient.addColorStop(1, '#DCE3E6'); // Very light blue/gray at bottom
            this.ctx.fillStyle = skyGradient;
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Draw snowflakes
            this.snowflakes.forEach(flake => {
                this.ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
                this.ctx.beginPath();
                this.ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
                this.ctx.fill();
            });
        }

        // Draw Terrain
        this.terrain.draw(this.ctx);

        // Draw entities
        this.tanks.forEach(tank => tank.draw(this.ctx));
        this.mines.forEach(mine => mine.draw(this.ctx));
        this.carePackages.forEach(cp => cp.draw(this.ctx));
        this.airplanes.forEach(plane => plane.draw(this.ctx));
        this.projectiles.forEach(p => p.draw(this.ctx));
        this.explosions.forEach(e => e.draw(this.ctx));
    }
}

// -------------------------------------------------------------
// Terrain System
// -------------------------------------------------------------
class Terrain {
    constructor(width, height, theme = 'day') {
        this.width = width;
        this.height = height;
        this.theme = theme;
        this.heights = new Float32Array(width);
        this.generate();
    }

    generate() {
        // Procedural generation using randomized sine waves
        const baseHeight = this.height * 0.6 + (Math.random() - 0.5) * 60;

        const amplitude1 = 60 + Math.random() * 60;
        const freq1 = 0.003 + Math.random() * 0.004;
        const phase1 = Math.random() * Math.PI * 2;

        const amplitude2 = 20 + Math.random() * 40;
        const freq2 = 0.01 + Math.random() * 0.015;
        const phase2 = Math.random() * Math.PI * 2;

        const amplitude3 = 10 + Math.random() * 20;
        const freq3 = 0.03 + Math.random() * 0.03;
        const phase3 = Math.random() * Math.PI * 2;

        for (let x = 0; x < this.width; x++) {
            this.heights[x] = baseHeight
                + Math.sin(x * freq1 + phase1) * amplitude1
                + Math.sin(x * freq2 + phase2) * amplitude2
                + Math.sin(x * freq3 + phase3) * amplitude3;
        }
    }

    getHeight(x) {
        x = Math.floor(Math.max(0, Math.min(this.width - 1, x)));
        return this.heights[x];
    }

    destroyCircle(cx, cy, radius) {
        const startX = Math.floor(Math.max(0, cx - radius));
        const endX = Math.floor(Math.min(this.width - 1, cx + radius));

        for (let x = startX; x <= endX; x++) {
            const dx = Math.abs(x - cx);
            const dy = Math.sqrt(radius * radius - dx * dx); // circle formula

            const bottomArcY = cy + dy;

            // If the chunk of circle is below the current terrain height, we lower the terrain
            // Prevent digging below a bedrock layer (e.g. 20 pixels from bottom)
            const bedrockY = this.height - 20;
            if (this.heights[x] < bottomArcY) {
                this.heights[x] = Math.min(bottomArcY, bedrockY); // Push the ground down, but not past bedrock
            }
        }
    }

    draw(ctx) {
        let fillColor, strokeColor;

        if (this.theme === 'day') {
            fillColor = '#228B22'; // Forest Green
            strokeColor = '#186418';
        } else if (this.theme === 'desert') {
            fillColor = '#EEDD82'; // Light Goldenrod / Sand
            strokeColor = '#DAA520'; // Goldenrod shadow
        } else if (this.theme === 'night') {
            fillColor = '#444444'; // Gray rocky ground
            strokeColor = '#222222'; // Dark rocky shadow
        } else if (this.theme === 'snow') {
            fillColor = '#F2F6F8'; // Dirty white / snow
            strokeColor = '#C4D1D6'; // Light gray shadow
        }

        ctx.fillStyle = fillColor; 
        ctx.beginPath();
        ctx.moveTo(0, this.height);

        for (let x = 0; x < this.width; x++) {
            ctx.lineTo(x, this.heights[x]);
        }

        ctx.lineTo(this.width, this.height);
        ctx.closePath();
        ctx.fill();

        // Add a slight outline/shadow for depth
        ctx.lineWidth = 3;
        ctx.strokeStyle = strokeColor;
        ctx.beginPath();
        for (let x = 0; x < this.width; x++) {
            ctx.lineTo(x, this.heights[x]);
        }
        ctx.stroke();
    }
}

// -------------------------------------------------------------
// Tank Entity
// -------------------------------------------------------------
class Tank {
    constructor(x, y, color, isPlayer) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.isPlayer = isPlayer;

        this.width = 40;
        this.height = 20;

        this.health = 100;
        this.speed = 100;

        // Turret
        this.angle = isPlayer ? -Math.PI / 4 : -Math.PI * 0.75;
        this.barrelLength = 30;

        // Mechanics
        this.power = 0;
        this.isCharging = false;
        this.cooldown = 0;
        this.machineGunCooldown = 0;
        this.gravity = 500;
        this.vy = 0;

        // Buffs
        this.invulnerableTime = 0;
        this.machineGunTime = 0;

        // Fuel
        this.maxFuel = 1024; // Roughly one screen width
        this.fuel = this.maxFuel;
    }

    move(dir, dt, terrain) {
        if (this.fuel <= 0) return false;

        let intendedX = this.x + dir * this.speed * dt;
        // Keep in bounds
        intendedX = Math.max(this.width / 2, Math.min(terrain.width - this.width / 2, intendedX));

        let distanceMoved = Math.abs(intendedX - this.x);

        // Slope checking (look ahead 4 pixels)
        let currentY = terrain.getHeight(this.x);
        let probeX = this.x + dir * 4;
        let probeY = terrain.getHeight(probeX);

        let climbHeight = currentY - probeY; // Positive if moving uphill

        // Block movement only on nearly vertical walls (e.g. > 11px climb over 4px horizontal)
        if (climbHeight > 11) {
            return false; // Hit a wall, movement blocked
        }

        this.x = intendedX;
        this.fuel = Math.max(0, this.fuel - distanceMoved);
        return true; // Successfully moved
    }

    aim(dir, dt) {
        const aimSpeed = 2; // radians per sec
        this.angle -= dir * aimSpeed * dt;

        // Restrict aiming angles based on player tank position
        // player angle naturally points right, enemy angle naturally points left
        if (this.isPlayer) {
            this.angle = Math.max(-Math.PI + 0.1, Math.min(-0.1, this.angle));
        } else {
            this.angle = Math.max(-Math.PI + 0.1, Math.min(-0.1, this.angle));
        }
    }

    chargePower(dt) {
        this.isCharging = true;
        this.power += 100 * dt; // Max power in 1 sec
        if (this.power > 100) this.power = 100;
    }

    updatePhysics(dt, terrain) {
        if (this.cooldown > 0) this.cooldown -= dt;
        if (this.machineGunCooldown > 0) this.machineGunCooldown -= dt;
        if (this.invulnerableTime > 0) this.invulnerableTime -= dt;
        if (this.machineGunTime > 0) this.machineGunTime -= dt;

        // Fall down if terrain was destroyed below
        const groundY = terrain.getHeight(this.x);

        if (this.y < groundY) {
            this.vy += this.gravity * dt;
            this.y += this.vy * dt;

            // Hit ground (now there is a bedrock, so we just snap to ground)
            if (this.y > groundY) {
                this.y = groundY;
                this.vy = 0;
            }
        } else {
            // Slope follow up (snap to ground if walking up a hill)
            this.y = groundY;
            this.vy = 0;
        }
    }

    takeDamage(amount) {
        if (this.invulnerableTime > 0) {
            // Shield mitigation: 50% at 15s max, scaling down to 0% at 0s
            const maxInvuln = 15;
            const mitigationPercent = 0.5 * (this.invulnerableTime / maxInvuln);
            amount = amount * (1 - mitigationPercent);
        }
        
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.power = 0; 
            this.isCharging = false;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Determine Sprite
        const spriteKey = this.isPlayer ? 'gray_tank' : 'red_tank';
        const sprite = AssetManager.sprites[spriteKey];

        // We scale the tank down a bit (1.6x width instead of 2.1x)
        const scaleFactor = 1.6;
        const turretY = sprite ? -16 : -10;

        // Determine barrel color: use dark gray/black so it's visible. Otherwise use tank color.
        const barrelColor = this.isPlayer ? '#222222' : this.color;

        // Draw Turret Barrel FIRST so it goes behind the hull sprite
        ctx.save();
        ctx.translate(0, turretY);
        ctx.rotate(this.angle);
        ctx.lineWidth = 6;
        ctx.strokeStyle = this.machineGunTime > 0 ? '#ffcc00' : barrelColor;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.barrelLength, 0);
        ctx.stroke();
        ctx.restore();

        // Shield visual - glowing aura around the tank sprite
        if (this.invulnerableTime > 0) {
            // Fade out the glow based on remaining time (assuming max 15s)
            const maxInvuln = 15;
            const intensity = Math.min(1, this.invulnerableTime / maxInvuln);
            // Stronger purple/magenta color
            ctx.shadowColor = `rgba(220, 50, 255, ${Math.min(1, intensity * 2.0)})`;
            ctx.shadowBlur = 40 * intensity;     
        } else {
            ctx.shadowBlur = 0; // Reset shadow
        }

        // Draw Sprite Hull/Wheels if loaded, else fallback to procedural
        if (sprite) {
            // Keep original aspect ratio
            const drawWidth = this.width * scaleFactor;
            const aspect = sprite.height / sprite.width;
            const drawHeight = drawWidth * aspect;
            
            // Draw centered horizontally, and adjust vertically so the padded image aligns with the ground (y=0)
            ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2 - 10, drawWidth, drawHeight);
        } else {
            // Turret joint
            ctx.fillStyle = '#222';
            ctx.beginPath();
            ctx.arc(0, -10, 8, 0, Math.PI * 2);
            ctx.fill();

            // Wheels/Treads
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.roundRect(-this.width / 2, -5, this.width, 10, 5);
            ctx.fill();

            // Hull
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, -10, 15, Math.PI, 0);
            ctx.fill();
        }

        // Reset shadow for subsequent draws
        ctx.shadowBlur = 0;

        ctx.restore();
    }
}

// -------------------------------------------------------------
// Projectile
// -------------------------------------------------------------
class Projectile {
    constructor(x, y, vx, vy, owner = null) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.owner = owner;
        this.lifeTime = 0;
        this.gravity = 500;
        this.active = true;
    }

    update(dt, wind) {
        this.lifeTime += dt;
        this.vy += this.gravity * dt;
        this.vx += wind * dt; // Apply wind acceleration
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw(ctx) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Small trail
        ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.beginPath();
        ctx.arc(this.x - this.vx * 0.02, this.y - this.vy * 0.02, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// -------------------------------------------------------------
// Explosion
// -------------------------------------------------------------
class Explosion {
    constructor(x, y, maxRadius) {
        this.x = x;
        this.y = y;
        this.maxRadius = maxRadius;
        this.radius = 1;
        this.life = 1.0; // 1 second
        this.isDead = false;

        // Spawn particles?
        this.particles = [];
        for (let i = 0; i < 10; i++) {
            this.particles.push({
                x: 0, y: 0,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                life: Math.random() * 0.5 + 0.2
            });
        }
    }

    update(dt) {
        if (this.isDead) return;

        this.life -= dt * 2;
        if (this.life <= 0) {
            this.isDead = true;
        }

        // Grow radius fast, then slow down
        this.radius = this.maxRadius * (1 - Math.pow(this.life, 3));

        this.particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        });
    }

    draw(ctx) {
        if (this.isDead) return;

        // Core
        ctx.save();
        ctx.translate(this.x, this.y);

        const alpha = Math.max(0, this.life);

        // Outer blast
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 100, 0, ${alpha * 0.6})`;
        ctx.fill();

        // Inner core
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
        ctx.fill();

        // Particles
        this.particles.forEach(p => {
            if (p.life > 0) {
                ctx.fillStyle = `rgba(255, 200, 50, ${p.life})`;
                ctx.fillRect(p.x, p.y, 4, 4);
            }
        });

        ctx.restore();
    }
}

// -------------------------------------------------------------
// AI logic (Simple)
// -------------------------------------------------------------
class AI {
    constructor(tank, target, terrain) {
        this.tank = tank;
        this.target = target;
        this.terrain = terrain;

        this.state = 'idle'; // idle, aiming, charging
        this.stateTimer = 0;
        this.targetAngle = -Math.PI / 2;
        this.targetPower = 50;
        this.movingTimer = 0;
        this.moveDir = 0;
    }

    update(dt, game) {
        // Very rudimentary AI
        if (this.tank.health <= 0 || game.player.health <= 0 || game.isEnding) return;

        this.stateTimer -= dt;
        this.movingTimer -= dt;

        let priorityTargetX = null;
        let fleeX = null;

        // Check if there are care packages on the ground
        if (game.carePackages.length > 0) {
            priorityTargetX = game.carePackages[0].x;
        } else if (game.airplanes.length > 0) {
            // Only care about the first one it checks
            for (let plane of game.airplanes) {
                if (!plane.hasDropped) {
                    if (plane.payloadType === 'package') {
                        priorityTargetX = plane.dropX;
                        break;
                    } else if (plane.payloadType === 'bomb') {
                        if (Math.abs(this.tank.x - plane.dropX) < 150) {
                            fleeX = plane.dropX;
                            break;
                        }
                    }
                }
            }
        }

        let isEmergencyMoving = false;

        if (priorityTargetX !== null) {
            if (Math.abs(priorityTargetX - this.tank.x) > 10) {
                this.moveDir = priorityTargetX > this.tank.x ? 1 : -1;
                isEmergencyMoving = true;
            }
        } else if (fleeX !== null) {
            this.moveDir = fleeX > this.tank.x ? 1 : -1; // Move away

            // Keep in bounds while fleeing
            if (this.tank.x < 100) this.moveDir = 1;
            if (this.tank.x > game.width - 100) this.moveDir = -1;

            isEmergencyMoving = true;
        }

        // Handle movement separately from shooting
        if (isEmergencyMoving || this.movingTimer > 0) {
            let successfullyMoved = this.tank.move(this.moveDir, dt, this.terrain);
            if (!successfullyMoved && !isEmergencyMoving) {
                // If it hits a steep wall while wandering, turn around
                this.moveDir *= -1;
                this.movingTimer = 0.5;
            }
        }

        switch (this.state) {
            case 'idle':
                if (this.stateTimer <= 0) {
                    // Ready to attack!
                    this.state = 'aiming';
                    this.stateTimer = Math.random() * 1.5 + 0.5;

                    // Roughly calculate trajectory
                    const dx = this.target.x - this.tank.x;
                    const dist = Math.abs(dx);
                    // Magic numbers for basic aim
                    this.targetAngle = dx < 0 ? -Math.PI + 0.5 : -0.5;
                    // Add some randomness
                    this.targetAngle += (Math.random() - 0.5) * 0.4;
                    this.targetPower = Math.min(100, Math.max(20, (dist / game.width) * 120 + (Math.random() * 20 - 10)));

                    // Optionally start wandering if not already emergency moving
                    if (!isEmergencyMoving && Math.random() < 0.3) {
                        this.movingTimer = Math.random() * 2 + 0.5;
                        this.moveDir = Math.random() > 0.5 ? 1 : -1;
                    }
                }
                break;

            case 'aiming':
                // Smooth aim
                if (this.tank.angle < this.targetAngle - 0.05) this.tank.aim(-1, dt);
                else if (this.tank.angle > this.targetAngle + 0.05) this.tank.aim(1, dt);

                if (this.tank.machineGunTime > 0) {
                    game.fireProjectile(this.tank, true);
                } else if (this.stateTimer <= 0) {
                    this.state = 'charging';
                }
                break;

            case 'charging':
                this.tank.chargePower(dt);
                if (this.tank.power >= this.targetPower) {
                    game.fireProjectile(this.tank);
                    this.tank.isCharging = false;
                    this.state = 'idle';
                    this.stateTimer = 1.0; // Wait a bit before next action
                }
                break;
        }
    }
}

// -------------------------------------------------------------
// Airplane
// -------------------------------------------------------------
class Airplane {
    constructor(gameWidth, gameHeight) {
        this.baseY = 30 + Math.random() * 40; // High in the sky
        this.y = this.baseY;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.x = this.direction === 1 ? -100 : gameWidth + 100;
        this.vx = this.direction * (120 + Math.random() * 60); // Speed
        this.dropX = 50 + Math.random() * (gameWidth - 100); // Random X to drop payload
        this.hasDropped = false;
        const rand = Math.random();
        if (rand < 0.20) this.payloadType = 'bomb';
        else if (rand < 0.40) this.payloadType = 'mine';
        else if (rand < 0.60) this.payloadType = 'package';
        else if (rand < 0.80) this.payloadType = 'fuel';
        else this.payloadType = 'toolbox';

        // Flight path variation
        this.flightPhase = Math.random() * Math.PI * 2;
        this.flightFrequency = 1.5 + Math.random() * 2;
        this.flightAmplitude = 10 + Math.random() * 10;
        this.timeAlive = 0;

        this.isDead = false;
        this.crashVy = 0;
        this.readyToRemove = false;
    }

    takeDamage(game) {
        if (this.isDead) return;
        this.isDead = true;
        // If it hasn't dropped payload yet, drop the carepackage immediately
        if (!this.hasDropped && (this.payloadType === 'package' || this.payloadType === 'fuel')) {
            this.hasDropped = true;
            game.sounds.playTone(400, 'sine', 0.5, 0.1, 300);
            game.carePackages.push(new CarePackage(this.x, this.y, this.payloadType));
        }
    }

    update(dt, game) {
        if (this.isDead) {
            this.x += this.vx * dt;
            this.crashVy += 500 * dt; // gravity
            this.y += this.crashVy * dt;

            const groundY = game.terrain.getHeight(this.x);
            if (this.y >= groundY) {
                game.createExplosion(this.x, this.y);
                this.readyToRemove = true;
            }
            return;
        }

        let prevX = this.x;
        this.x += this.vx * dt;

        // Vertical Wavy motion
        this.timeAlive += dt;
        this.y = this.baseY + Math.sin(this.timeAlive * this.flightFrequency + this.flightPhase) * this.flightAmplitude;

        // Check if crossed dropX
        if (!this.hasDropped) {
            if ((this.direction === 1 && prevX <= this.dropX && this.x >= this.dropX) ||
                (this.direction === -1 && prevX >= this.dropX && this.x <= this.dropX)) {

                // Drop bomb/mine/package
                this.hasDropped = true;
                if (this.payloadType === 'bomb') {
                    game.sounds.bombDrop();
                    game.projectiles.push(new Projectile(this.x, this.y, 0, 0, this));
                } else if (this.payloadType === 'mine') {
                    game.sounds.bombDrop();
                    game.mines.push(new Landmine(this.x, this.y));
                } else {
                    game.sounds.playTone(400, 'sine', 0.5, 0.1, 300);
                    game.carePackages.push(new CarePackage(this.x, this.y, this.payloadType));
                }
            }
        }
    }

    isOffScreen(gameWidth) {
        return (this.direction === 1 && this.x > gameWidth + 150) ||
            (this.direction === -1 && this.x < -150);
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.isDead) {
            ctx.rotate((this.direction === 1 ? 1 : -1) * this.crashVy * 0.005);
        }

        // Sprite airplane or helicopter based on payload
        const isHelicopter = (this.payloadType === 'package' || this.payloadType === 'fuel' || this.payloadType === 'toolbox');
        const spriteKey = isHelicopter ? 'yellow_helicopter' : 'gray_airplane';
        const sprite = AssetManager.sprites[spriteKey];

        // The AI generated helicopter seems to natively face right, while the airplane natively faces left.
        // We flip the airplane when flying right (1), and flip the helicopter when flying left (-1).
        const needsFlip = isHelicopter ? (this.direction === -1) : (this.direction === 1);
        if (needsFlip) {
            ctx.scale(-1, 1);
        }

        if (sprite) {
            // Keep original aspect ratio
            const drawWidth = isHelicopter ? 60 : 70;
            const aspect = sprite.height / sprite.width;
            const drawHeight = drawWidth * aspect;
            
            // Drawn centered
            ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        } else {
            // Fallback Simple airplane drawing
            ctx.fillStyle = '#666';

            // Fuselage
            ctx.beginPath();
            ctx.ellipse(0, 0, 25, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Pilot window
            ctx.fillStyle = '#add8e6';
            ctx.beginPath();
            ctx.arc(10, -2, 4, 0, Math.PI);
            ctx.fill();

            // Under-Wing
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.moveTo(-5, 0);
            ctx.lineTo(8, 0);
            ctx.lineTo(-2, 12);
            ctx.fill();

            // Tail
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.moveTo(-18, 0);
            ctx.lineTo(-25, -12);
            ctx.lineTo(-12, 0);
            ctx.fill();
        }

        // Payload attached (if not dropped)
        if (!this.hasDropped) {
            if (this.payloadType === 'bomb') {
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.ellipse(0, 8, 5, 3, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.payloadType === 'mine') {
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.arc(0, 8, 4, Math.PI, 0);
                ctx.fill();
            } else if (this.payloadType === 'package') {
                ctx.fillStyle = 'white';
                ctx.fillRect(-5, 4, 10, 10);
                ctx.fillStyle = 'red';
                ctx.fillRect(-1, 5, 2, 8);
                ctx.fillRect(-4, 8, 8, 2);
            } else if (this.payloadType === 'fuel') {
                ctx.fillStyle = 'orange';
                ctx.fillRect(-5, 4, 10, 10);
                ctx.fillStyle = 'black';
                ctx.font = '8px Arial';
                ctx.fillText('F', -3, 12);
            } else if (this.payloadType === 'toolbox') {
                ctx.fillStyle = '#cc0000'; // red toolbox
                ctx.fillRect(-5, 6, 10, 6);
                // handle
                ctx.fillStyle = '#333';
                ctx.fillRect(-3, 4, 6, 2);
                ctx.fillStyle = '#cc0000';
                ctx.fillRect(-2, 5, 4, 1);
            }
        }

        ctx.restore();
    }
}

// -------------------------------------------------------------
// Care Package
// -------------------------------------------------------------
class CarePackage {
    constructor(x, y, type = 'package') {
        this.x = x;
        this.y = y;
        this.vy = 0;
        this.gravity = 150; // Slower fall simulating a parachute
        this.collected = false;
        this.type = type;
    }

    update(dt, terrain, wind) {
        const groundY = terrain.getHeight(this.x);
        if (this.y < groundY - 6) {
            this.vy += this.gravity * dt;
            if (this.vy > 100) this.vy = 100; // Terminal velocity with parachute

            // Apply wind to care package slowly moving it horizontally
            this.x += wind * 0.3 * dt;

            this.y += this.vy * dt;
        } else {
            this.y = groundY - 6;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Draw Parachute if falling
        if (this.vy > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(0, -12, 12, Math.PI, 0);
            ctx.fill();

            ctx.lineWidth = 1;
            ctx.strokeStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(-12, -12); ctx.lineTo(-4, -6);
            ctx.moveTo(12, -12); ctx.lineTo(4, -6);
            ctx.moveTo(0, -12); ctx.lineTo(0, -6);
            ctx.stroke();
        }

        if (this.type === 'package') {
            // Draw Box
            ctx.fillStyle = 'white';
            ctx.fillRect(-6, -6, 12, 12);

            // Draw Cross
            ctx.fillStyle = 'red';
            ctx.fillRect(-2, -4, 4, 8);
            ctx.fillRect(-4, -2, 8, 4);
        } else if (this.type === 'fuel') {
            ctx.fillStyle = 'orange';
            ctx.fillRect(-6, -6, 12, 12);
            ctx.fillStyle = 'black';
            ctx.font = '10px Arial';
            ctx.fillText('F', -3, 4);
        } else if (this.type === 'toolbox') {
            // Draw a red toolbox
            ctx.fillStyle = '#cc0000'; // Red toolbox body
            ctx.fillRect(-7, -2, 14, 8);
            
            // Draw handle
            ctx.fillStyle = '#333'; // Dark handle
            ctx.fillRect(-4, -5, 8, 3);
            ctx.fillStyle = '#cc0000'; // cut out inside of handle (background trick)
            ctx.fillRect(-2, -4, 4, 2);

            // Draw latch / detail
            ctx.fillStyle = '#ccc'; // silver latch
            ctx.fillRect(-2, 0, 4, 2);
        }

        ctx.restore();
    }
}

// -------------------------------------------------------------
// Landmine
// -------------------------------------------------------------
class Landmine {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vy = 0;
        this.gravity = 500;
        this.isLanded = false;
        this.blinkTimer = 0;
    }

    update(dt, terrain) {
        if (!this.isLanded) {
            this.vy += this.gravity * dt;
            this.y += this.vy * dt;
            const groundY = terrain.getHeight(this.x);
            if (this.y >= groundY) {
                this.y = groundY;
                this.vy = 0;
                this.isLanded = true;
            }
        } else {
            // Keep exactly on the ground even if terrain gets destroyed below it
            const groundY = terrain.getHeight(this.x);
            if (this.y < groundY) {
                this.isLanded = false; // Fall again
            } else {
                this.y = groundY;
            }
            
            this.blinkTimer += dt;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Draw mine (half-circle on ground)
        if (!this.isLanded) {
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(0, 0, 6, Math.PI, 0); // Flat bottom when landed
            ctx.fill();

            // Blinking red light
            if (Math.sin(this.blinkTimer * 10) > 0) {
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(0, -6, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

// Bootstrap
const game = new Game();
window.onload = async () => {
    await AssetManager.loadAll();
    game.init();
};
