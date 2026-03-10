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
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Bind requestAnimationFrame context
        this.loop = this.loop.bind(this);
    }

    init() {
        document.getElementById('gameOver').style.display = 'none';

        this.terrain = new Terrain(this.width, this.height);

        // Setup Player
        const playerX = 150;
        this.player = new Tank(playerX, this.terrain.getHeight(playerX), 'black', true);

        // Setup Enemy
        const enemyX = this.width - 150;
        this.enemy = new Tank(enemyX, this.terrain.getHeight(enemyX), '#cc0000', false);
        this.ai = new AI(this.enemy, this.player, this.terrain);

        this.tanks = [this.player, this.enemy];
        this.projectiles = [];
        this.explosions = [];
        this.carePackages = [];
        this.airplanes = [];
        this.airplaneTimer = Math.random() * 2.5 + 1.5; // 1.5 to 4 seconds
        this.wind = (Math.random() - 0.5) * 300; // Wind strength between -150 and 150

        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);

        document.getElementById('enemyName').innerText = 'CPU (Enemy)';
        document.getElementById('enemyPowerLabel').innerText = 'Power';
        document.getElementById('controlsText').innerHTML = '<span>←/→ Move</span> &nbsp;|&nbsp; <span>↑/↓ Aim Turret</span> &nbsp;|&nbsp; <span>Space: Hold to power shot</span>';

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
            if (plane.isOffScreen(this.width)) {
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
                    if (Math.random() < 0.5) {
                        tank.invulnerableTime = 10 + Math.random() * 5; // 10-15s
                    } else {
                        tank.machineGunTime = 5; // 5s
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
            // Bounds check
            if (p.x < 0 || p.x > this.width || p.y > this.height) {
                this.projectiles.splice(i, 1);
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

    createExplosion(x, y) {
        this.sounds.explosion();
        const radius = 50;
        this.explosions.push(new Explosion(x, y, radius));
        this.terrain.destroyCircle(x, y, radius);

        // Damage calculations
        this.tanks.forEach(tank => {
            const dist = Math.hypot(tank.x - x, (tank.y - 10) - y); // approx tank center

            if (dist < radius) {
                // If fully inside (assuming tank is small enough), instant 100% damage
                // But realistically, we can check if dist is small enough
                if (dist < radius * 0.5) {
                    tank.takeDamage(100);
                } else {
                    // Scale damage: edge of explosion = minor damage, closer = more
                    const damage = 100 * (1 - (dist / radius));
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
            document.getElementById('controlsText').innerHTML = '<span>P1 (Black): ←/→ Move, ↑/↓ Aim, Space Fire</span><br><span>P2 (Red): A/D Move, W/S Aim, Q Fire</span>';
        }
    }

    checkWinCondition() {
        if (this.player.health <= 0 || this.enemy.health <= 0) {
            if (!this.isRunning) return;
            this.isRunning = false;
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
    }

    draw() {
        // Draw sky gradient
        const skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        skyGradient.addColorStop(0, '#1E90FF'); // Darker sky blue at the top
        skyGradient.addColorStop(1, '#FFFFFF'); // White at the bottom
        this.ctx.fillStyle = skyGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw Terrain
        this.terrain.draw(this.ctx);

        // Draw entities
        this.tanks.forEach(tank => tank.draw(this.ctx));
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
    constructor(width, height) {
        this.width = width;
        this.height = height;
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
            if (this.heights[x] < bottomArcY) {
                this.heights[x] = bottomArcY; // Push the ground down
            }
        }
    }

    draw(ctx) {
        ctx.fillStyle = '#228B22'; // Forest Green
        ctx.beginPath();
        ctx.moveTo(0, this.height);

        for (let x = 0; x < this.width; x++) {
            ctx.lineTo(x, this.heights[x]);
        }

        ctx.lineTo(this.width, this.height);
        ctx.closePath();
        ctx.fill();

        // Add a slight grass outline/shadow for depth
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#186418';
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

            // Hit ground (only if the ground is intact, otherwise keep falling)
            if (this.y > groundY && groundY < terrain.height - 5) {
                this.y = groundY;
                this.vy = 0;
            }
        } else if (groundY < terrain.height - 5) {
            // Slope follow up (snap to ground if walking up a hill)
            this.y = groundY;
            this.vy = 0;
        }

        // Check if tank fell into the abyss
        if (this.y > terrain.height + this.height) {
            this.invulnerableTime = 0; // Shield doesn't save you from the abyss
            this.takeDamage(100);
        }
    }

    takeDamage(amount) {
        if (this.invulnerableTime > 0) return; // Shield protects damage!
        this.health -= amount;
        if (this.health < 0) this.health = 0;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Body
        ctx.fillStyle = this.color;

        // Wheels/Treads
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -5, this.width, 10, 5);
        ctx.fill();

        // Hull
        ctx.fillStyle = this.color;
        ctx.beginPath();
        // A simple trapezoid-like hull using bezier or simple arc
        ctx.arc(0, -10, 15, Math.PI, 0);
        ctx.fill();

        // Shield visual
        if (this.invulnerableTime > 0) {
            ctx.beginPath();
            ctx.arc(0, -10, 25, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(Date.now() / 100) * 0.5})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Turret Barrel
        ctx.rotate(this.angle);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#555';
        ctx.beginPath();
        ctx.moveTo(0, 0); // attached around center-top (-10y) but translated
        // Wait, let's fix the drawing context for the turret
        ctx.restore();

        // Draw turret barrel from the top center
        ctx.save();
        ctx.translate(this.x, this.y - 10);
        ctx.rotate(this.angle);
        ctx.lineWidth = 6;
        ctx.strokeStyle = this.machineGunTime > 0 ? '#ffcc00' : this.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.barrelLength, 0);
        ctx.stroke();

        // Turret joint
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// -------------------------------------------------------------
// Projectile
// -------------------------------------------------------------
class Projectile {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.gravity = 500;
        this.active = true;
    }

    update(dt, wind) {
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
        if (this.tank.health <= 0 || game.player.health <= 0) return;

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
            // Check if moving into a pit
            const lookAheadX = this.tank.x + this.moveDir * 40;
            if (lookAheadX > 0 && lookAheadX < game.width) {
                const upcomingY = this.terrain.getHeight(lookAheadX);
                if (upcomingY >= this.terrain.height - 5) {
                    this.moveDir *= -1; // Turn around
                    this.movingTimer = 0.5; // Force moving away
                }
            }

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
        this.payloadType = Math.random() < 0.5 ? 'bomb' : 'package';

        // Flight path variation
        this.flightPhase = Math.random() * Math.PI * 2;
        this.flightFrequency = 1.5 + Math.random() * 2;
        this.flightAmplitude = 10 + Math.random() * 10;
        this.timeAlive = 0;
    }

    update(dt, game) {
        let prevX = this.x;
        this.x += this.vx * dt;

        // Vertical Wavy motion
        this.timeAlive += dt;
        this.y = this.baseY + Math.sin(this.timeAlive * this.flightFrequency + this.flightPhase) * this.flightAmplitude;

        // Check if crossed dropX
        if (!this.hasDropped) {
            if ((this.direction === 1 && prevX <= this.dropX && this.x >= this.dropX) ||
                (this.direction === -1 && prevX >= this.dropX && this.x <= this.dropX)) {

                // Drop bomb
                this.hasDropped = true;
                if (this.payloadType === 'bomb') {
                    game.sounds.bombDrop();
                    game.projectiles.push(new Projectile(this.x, this.y, 0, 0));
                } else {
                    game.sounds.playTone(400, 'sine', 0.5, 0.1, 300);
                    game.carePackages.push(new CarePackage(this.x, this.y));
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
        if (this.direction === -1) {
            ctx.scale(-1, 1);
        }

        // Simple airplane drawing
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

        // Payload attached (if not dropped)
        if (!this.hasDropped) {
            if (this.payloadType === 'bomb') {
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.ellipse(0, 8, 5, 3, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = 'white';
                ctx.fillRect(-5, 4, 10, 10);
                ctx.fillStyle = 'red';
                ctx.fillRect(-1, 5, 2, 8);
                ctx.fillRect(-4, 8, 8, 2);
            }
        }

        ctx.restore();
    }
}

// -------------------------------------------------------------
// Care Package
// -------------------------------------------------------------
class CarePackage {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vy = 0;
        this.gravity = 150; // Slower fall simulating a parachute
        this.collected = false;
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

        // Draw Box
        ctx.fillStyle = 'white';
        ctx.fillRect(-6, -6, 12, 12);

        // Draw Cross
        ctx.fillStyle = 'red';
        ctx.fillRect(-2, -4, 4, 8);
        ctx.fillRect(-4, -2, 8, 4);

        ctx.restore();
    }
}

// Bootstrap
const game = new Game();
window.onload = () => game.init();
