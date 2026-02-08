const playerContainer = document.getElementById('player-container');
const playerImg = document.getElementById('player');
const world = document.getElementById('world');
const lifeDisplay = document.getElementById('life-count');
const titlePlayer = document.getElementById('title-player');
const titleShell = document.getElementById('title-shell');

// Audio Elements
const bgMusic = document.getElementById('bg-music');
const jumpSound = document.getElementById('jump-sound');
const winSound = document.getElementById('win-sound');

let posX = 150, posY = 0, velY = 0;
let lives = 3;
let isJumping = false, isPaused = false, currentGate = 0, gameStarted = false;
let cameraX = 0; // Track camera position for smooth movement

// Boss Fight Variables
let bossActive = false;
let bossHealth = 5;
let bossX = 4900;
let bossY = 0;
let bossDirection = 1;
let bossSpeed = 2;
let bossAttackTimer = 0;
let bossProjectiles = [];
let playerProjectiles = [];
let bossHitCooldown = 0;
let canUseSpecialAttack = false;
let attackCooldown = 0;

const gravity = 1.3, jumpPower = 30, moveSpeed = 8;
const platforms = [
    // Continuous platforms - easy walking with no gaps
    { x: 0, w: 800, y: 0 },           // Starting area to Q1
    { x: 800, w: 900, y: 0 },         // Past Q1 to Q2
    { x: 1700, w: 150, y: 50 },       // Small step up for variety
    { x: 1850, w: 850, y: 0 },        // Continue to Q3
    { x: 2700, w: 900, y: 0 },        // Past Q3 to Q4
    { x: 3600, w: 150, y: 40 },       // Another small step
    { x: 3750, w: 900, y: 0 },        // Continue to Q5 and castle
    { x: 4650, w: 700, y: 0 }         // Final stretch to victory
];

const blockXPositions = [600, 1600, 2600, 3500, 4200];

// 1. INPUT HANDLING
window.addEventListener("keydown", (e) => {
    if(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, {passive: false});

const keys = {};
window.onkeydown = (e) => { keys[e.key.toLowerCase()] = true; if(e.key === " ") keys["space"] = true; };
window.onkeyup = (e) => { keys[e.key.toLowerCase()] = false; if(e.key === " ") keys["space"] = false; };

// 2. THE START TRIGGER (Unlocks Audio)
function startGame() {
    gameStarted = true;
    document.getElementById('title-screen').style.display = 'none';
    
    // Start music with a small delay to ensure audio context is ready
    setTimeout(() => {
        bgMusic.volume = 0.3;
        bgMusic.play().catch(error => {
            console.log("Music autoplay prevented, will start on first jump");
        });
    }, 100);

    loop();
}

function showInstructions() {
    document.getElementById('instructions-screen').style.display = 'flex';
}

function hideInstructions() {
    document.getElementById('instructions-screen').style.display = 'none';
}

// 3. SOUND PLAYER HELPER - Ultra robust version
function playEffect(audioElement) {
    if (!audioElement) {
        console.log("❌ Audio element not found!");
        return;
    }
    
    console.log("🔊 Attempting to play:", audioElement.id);
    
    try {
        // CRITICAL: Stop any current playback completely
        audioElement.pause();
        
        // Reset to beginning
        audioElement.currentTime = 0;
        
        // Ensure volume is correct
        audioElement.volume = 1.0;
        
        // Small delay to ensure the pause/reset has taken effect
        setTimeout(() => {
            audioElement.play()
                .then(() => {
                    console.log("✓ Successfully playing:", audioElement.id);
                })
                .catch(e => {
                    console.log("✗ Playback failed:", audioElement.id, e.message);
                    
                    // Try one more time with a new Audio object as absolute fallback
                    try {
                        const src = audioElement.currentSrc || audioElement.src;
                        if (src) {
                            const backup = new Audio(src);
                            backup.volume = 1.0;
                            backup.play().catch(() => {});
                        }
                    } catch (e2) {
                        console.log("Fallback also failed");
                    }
                });
        }, 50);
        
    } catch (error) {
        console.log("❌ Error in playEffect:", error);
    }
}

// SILENT audio unlock - NO AUDIBLE SOUND
let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    
    console.log("🔓 Silently unlocking audio context...");
    
    // Create a silent unlock by muting all audio first
    [bgMusic, jumpSound, winSound].forEach(audio => {
        audio.muted = true;
        audio.play()
            .then(() => {
                audio.pause();
                audio.currentTime = 0;
                audio.muted = false;
                console.log("✓ Silently unlocked:", audio.id);
            })
            .catch(() => {
                audio.muted = false;
            });
    });
    
    audioUnlocked = true;
}

// Unlock on first user interaction
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// PARTICLE SYSTEM
function createParticle(x, y, type = 'heart') {
    const particleContainer = document.getElementById('particle-container');
    if (!particleContainer) return;
    
    const particle = document.createElement('div');
    particle.className = `particle ${type}`;
    particle.textContent = type === 'heart' ? '💖' : '✨';
    
    // Convert world position (x, y) to screen position
    // x is in world space, need to subtract camera position
    const screenX = x - cameraX;
    
    // y is relative to stage bottom, need to convert to screen position
    // Stage is at 50% height with transform translateY(-50%)
    const stage = document.getElementById('stage');
    const stageRect = stage.getBoundingClientRect();
    const screenY = window.innerHeight - stageRect.bottom + y;
    
    particle.style.left = screenX + 'px';
    particle.style.bottom = screenY + 'px';
    
    // Random slight horizontal drift
    const drift = (Math.random() - 0.5) * 50;
    particle.style.setProperty('--drift', drift + 'px');
    
    particleContainer.appendChild(particle);
    
    // Remove after animation
    setTimeout(() => {
        particle.remove();
    }, 2000);
}

function createHeartBurst(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const offsetX = (Math.random() - 0.5) * 60;
            const offsetY = Math.random() * 20;
            createParticle(x + offsetX, y + offsetY, 'heart');
        }, i * 100);
    }
}

// SPARKLE SYSTEM
let sparkleInterval = null;

function startSparkles() {
    if (sparkleInterval) return;
    
    sparkleInterval = setInterval(() => {
        if (!gameStarted || isPaused) return;
        
        const sparkleContainer = document.getElementById('sparkle-container');
        if (!sparkleContainer) return;
        
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle';
        
        // Random position around character
        const randomX = (Math.random() - 0.5) * 120;
        const randomY = (Math.random() - 0.5) * 120;
        
        sparkle.style.setProperty('--sparkle-x', randomX + 'px');
        sparkle.style.setProperty('--sparkle-y', randomY + 'px');
        sparkle.style.left = (75 + randomX / 2) + 'px';
        sparkle.style.top = (75 + randomY / 2) + 'px';
        
        sparkleContainer.appendChild(sparkle);
        
        setTimeout(() => sparkle.remove(), 1500);
    }, 300);
}

function stopSparkles() {
    if (sparkleInterval) {
        clearInterval(sparkleInterval);
        sparkleInterval = null;
    }
}

// COLLECTIBLE SYSTEM
let collectedHearts = 0;

function checkCollectibles() {
    const collectibles = document.querySelectorAll('.collectible:not(.collected)');
    
    collectibles.forEach(heart => {
        const heartX = parseInt(heart.style.left);
        const heartY = parseInt(heart.style.bottom);
        
        // Check if player is near the heart
        if (Math.abs(posX + 75 - heartX) < 40 && Math.abs(posY + 75 - heartY) < 40) {
            // Collect the heart!
            heart.classList.add('collected');
            collectedHearts++;
            
            // Update HUD
            const heartCount = document.getElementById('heart-count');
            if (heartCount) heartCount.textContent = collectedHearts;
            
            // Create sparkle effect
            createParticle(heartX, heartY, 'heart');
            
            // Remove after animation
            setTimeout(() => {
                heart.remove();
            }, 600);
        }
    });
}

// 4. TITLE ANIMATION
let titleX = 100, titleDir = 1;
function animateTitle() {
    if (gameStarted) return;
    titleX += 5 * titleDir;
    if (titleX > window.innerWidth - 200 || titleX < 50) titleDir *= -1;
    titlePlayer.style.left = titleX + "px";
    titlePlayer.style.transform = titleDir > 0 ? "scaleX(1)" : "scaleX(-1)";
    titleShell.classList.add('shell-spin'); 
    titleShell.style.left = (titleX + (titleDir > 0 ? 120 : -80)) + "px";
    requestAnimationFrame(animateTitle);
}
animateTitle();

// 5. MAIN GAME LOOP
function loop() {
    if (!isPaused && gameStarted) {
        if ((keys['space'] || keys['arrowup'] || keys['w']) && !isJumping) {
            isJumping = true; 
            velY = jumpPower;
            playerContainer.classList.add('jumping');
            playEffect(jumpSound);
            // Backup music start if it was blocked at title
            if (bgMusic.paused) bgMusic.play(); 
        }
        velY -= gravity;
        posY += velY;

        platforms.forEach(p => {
            const platformY = p.y || 0; // Default to ground level if no y specified
            const platformTop = platformY + 40; // Platform height is 40px
            
            // Check if player is horizontally on the platform
            if (posX + 60 > p.x && posX < p.x + p.w) {
                // Landing on top of platform (falling down onto it)
                if (posY <= platformY + 5 && posY >= platformY - 20 && velY <= 0) {
                    posY = platformY; 
                    velY = 0; 
                    isJumping = false;
                    playerContainer.classList.remove('jumping');
                }
                // Walking onto a higher platform (climbing up)
                else if (posY < platformY && posY > platformY - 60) {
                    posY = platformY;
                    velY = 0;
                    isJumping = false;
                    playerContainer.classList.remove('jumping');
                }
            }
        });

        if (posY < -350) {
            lives--; updateLives();
            posX = Math.max(0, posX - 250); posY = 400; velY = 0;
        }

        let nextX = posX;
        if (keys['d'] || keys['arrowright']) {
            nextX += moveSpeed;
            playerImg.style.transform = "scaleX(1)";
            playerContainer.classList.add('running');
        } else if (keys['a'] || keys['arrowleft']) {
            nextX = Math.max(0, posX - moveSpeed);
            playerImg.style.transform = "scaleX(-1)";
            playerContainer.classList.add('running');
        } else {
            playerContainer.classList.remove('running');
        }

        let canMove = true;
        if (currentGate < blockXPositions.length) {
            let bX = blockXPositions[currentGate];
            if (nextX + 25 > bX && posX < bX) canMove = false; 
            let playerMid = posX + 40;
            if (playerMid > bX && playerMid < bX + 60 && posY > 100 && velY > 0) {
                triggerQuestion();
            }
        }

        if (canMove) posX = nextX;
        // Position character so feet are ON the platform (platforms are 40px tall)
        // Offset by 30 instead of 40 so feet appear to touch ground
        playerContainer.style.bottom = (30 + posY) + 'px';
        playerContainer.style.left = posX + 'px';
        
        // Instant camera movement (no lag)
        cameraX = Math.max(0, posX - (window.innerWidth / 3));
        
        world.style.transform = `translateX(-${cameraX}px)`;
        
        // Parallax background layers move at different speeds
        const bgFar = document.getElementById('bg-layer-far');
        const bgMid = document.getElementById('bg-layer-mid');
        const bgNear = document.getElementById('bg-layer-near');
        
        if (bgFar) bgFar.style.transform = `translateX(-${cameraX * 0.2}px)`;
        if (bgMid) bgMid.style.transform = `translateX(-${cameraX * 0.4}px)`;
        if (bgNear) bgNear.style.transform = `translateX(-${cameraX * 0.6}px)`;
        
        // Check for collectible hearts
        checkCollectibles();
        
        // Trigger boss fight
        if (posX > 4700 && !bossActive && bossHealth > 0) {
            startBossFight();
        }
        
        // Update boss if active
        if (bossActive) {
            updateBoss();
        }
        
        if (posX > 5100 && bossHealth <= 0) finish();
    }
    requestAnimationFrame(loop);
}

function updateLives() {
    lifeDisplay.innerText = "❤️".repeat(Math.max(0, lives));
    if (lives <= 0) {
        isPaused = true;
        document.getElementById('game-over').style.display = 'flex';
        bgMusic.pause();
    }
}

function triggerQuestion() {
    if (isPaused) return;
    isPaused = true;
    document.getElementById('ui-layer').style.display = 'flex';
    
    const questions = [
        { q: "If we are ordering takeout on a Friday night and can't decide, what is my 'safety' choice?", opts: ["Pizza", "Sushi/Asian", "Tacos/Mexican", "Burgers"], a: 2 },
        { q: "When do I think you look the absolute hottest?", opts: ["Straight out of the shower, dripping wet with just a towel.", "Focused and 'in the zone' working on something.", "Dressed up for a night on the town"], a: 1 },
        { q: "Who is more likely to finish a Netflix series without the other person?", opts: ["Luv", "Mike"], a: 1 },
        { q: "If I could 'borrow' one piece of your clothing to wear to bed, which would I pick?", opts: ["Oversized t-shirt", "Button-down", "Just your hoodie"], a: 0 },
        { q: "What is the one thing you do to me that makes my knees go weak instantly?", opts: ["When you breathe on my neck softly", "When you give me That 'look'", "When you take total control and tell me exactly what to do.", "All of the above"], a: 3 },
        { q: "Who is more likely to start an argument when they are actually just hungry?", opts: ["Luv", "Mike", "Both of us"], a: 2 }
    ];

    const q = questions[currentGate];
    if(!q) return;

    document.getElementById('q-text').innerText = q.q;
    const optDiv = document.getElementById('options');
    optDiv.innerHTML = '';
    
    q.opts.forEach((o, i) => {
        let b = document.createElement('button');
        b.className = 'btn'; b.innerText = o;
        
        // Prevent multiple clicks
        let clicked = false;
        
        b.onclick = () => {
            if (clicked) return; // Prevent double-clicking
            clicked = true;
            
            if (i === q.a) {
                // SUCCESS
                console.log("🎉 CORRECT ANSWER! Question #" + (currentGate + 1));
                
                // Create heart burst particles!
                createHeartBurst(posX + 75, posY + 150, 8);
                
                // Change button color to show it was correct
                b.style.background = '#4CAF50';
                b.style.border = '4px solid #fff';
                b.innerText = '✓ ' + o;
                
                // Disable all buttons to prevent multiple answers
                document.querySelectorAll('#options .btn').forEach(btn => {
                    btn.style.opacity = '0.6';
                    btn.style.pointerEvents = 'none';
                });
                
                // Small delay before closing to show feedback
                setTimeout(() => {
                    document.getElementById('ui-layer').style.display = 'none';
                    const blocks = document.querySelectorAll('.q-block');
                    blocks[currentGate].style.opacity = "0.3";
                    blocks[currentGate].innerText = "✔";
                    currentGate++; 
                    isPaused = false; 
                    posX += 80;
                }, 600);
            } else {
                console.log("❌ Wrong answer!");
                // Show wrong answer feedback
                b.style.background = '#f44336';
                b.style.border = '4px solid #fff';
                b.innerText = '✗ ' + o;
                
                // Disable all buttons
                document.querySelectorAll('#options .btn').forEach(btn => {
                    btn.style.opacity = '0.6';
                    btn.style.pointerEvents = 'none';
                });
                
                setTimeout(() => {
                    lives--; updateLives();
                    if (lives > 0) {
                        document.getElementById('ui-layer').style.display = 'none';
                        isPaused = false;
                    }
                }, 800);
            }
        };
        optDiv.appendChild(b);
    });
}

// BOSS FIGHT SYSTEM
function startBossFight() {
    bossActive = true;
    isPaused = true;
    
    // Show boss health bar
    const bossHealthContainer = document.getElementById('boss-health-container');
    if (bossHealthContainer) {
        bossHealthContainer.style.display = 'block';
    }
    
    // Show boss intro message
    const bossIntro = document.getElementById('boss-intro');
    if (bossIntro) {
        bossIntro.style.display = 'flex';
        
        setTimeout(() => {
            bossIntro.style.display = 'none';
            isPaused = false;
        }, 3000);
    }
    
    // Show boss element
    const bossElement = document.getElementById('boss');
    if (bossElement) {
        bossElement.style.display = 'block';
    }
}

function updateBoss() {
    if (bossHealth <= 0) return;
    
    const bossElement = document.getElementById('boss');
    if (!bossElement) return;
    
    // Move boss back and forth
    bossX += bossSpeed * bossDirection;
    if (bossX > 5000 || bossX < 4700) {
        bossDirection *= -1;
    }
    
    // Speed increases as health decreases
    bossSpeed = 2 + (5 - bossHealth) * 0.3;
    
    bossElement.style.left = bossX + 'px';
    bossElement.style.bottom = bossY + 'px';
    
    // Boss attacks - shoot projectiles
    bossAttackTimer++;
    if (bossAttackTimer > 100 - (5 - bossHealth) * 10) { // Faster attacks as health decreases
        shootBossProjectile();
        bossAttackTimer = 0;
    }
    
    // Update all projectiles
    updateBossProjectiles();
    updatePlayerProjectiles();
    
    // Cooldowns
    if (bossHitCooldown > 0) bossHitCooldown--;
    if (attackCooldown > 0) attackCooldown--;
    
    // Check for heart shooting (X key)
    if (keys['x'] && attackCooldown === 0) {
        shootHeart();
    }
    
    // Check if player touches boss (takes damage)
    if (posX + 60 > bossX && posX < bossX + 100 && 
        posY < bossY + 60 && posY > bossY - 20 &&
        bossHitCooldown === 0) {
        takeDamage();
    }
}

function shootBossProjectile() {
    bossProjectiles.push({
        x: bossX + 50,
        y: bossY + 50,
        vx: (posX < bossX) ? -5 : 5,
        vy: 0
    });
    
    // Create projectile element
    const projectile = document.createElement('div');
    projectile.className = 'boss-projectile';
    projectile.style.left = (bossX + 50) + 'px';
    projectile.style.bottom = (bossY + 50) + 'px';
    projectile.textContent = '💔';
    document.getElementById('world').appendChild(projectile);
}

function updateBossProjectiles() {
    bossProjectiles = bossProjectiles.filter((proj, index) => {
        proj.x += proj.vx;
        proj.vy -= 0.5; // Gravity
        proj.y += proj.vy;
        
        const projectiles = document.querySelectorAll('.boss-projectile');
        if (projectiles[index]) {
            projectiles[index].style.left = proj.x + 'px';
            projectiles[index].style.bottom = proj.y + 'px';
        }
        
        // Check collision with player
        if (Math.abs(proj.x - posX - 30) < 30 && Math.abs(proj.y - posY - 60) < 60) {
            takeDamage();
            if (projectiles[index]) projectiles[index].remove();
            return false;
        }
        
        // Remove if off screen or hit ground
        if (proj.y < -100 || proj.x < 0 || proj.x > 5500) {
            if (projectiles[index]) projectiles[index].remove();
            return false;
        }
        
        return true;
    });
}

function shootHeart() {
    // Check if player has any hearts
    if (collectedHearts < 2) {
        showTemporaryMessage("❌ Not enough hearts! Collect more! ❌");
        return;
    }
    
    attackCooldown = 30; // 0.5 second cooldown
    
    // Determine heart size/power based on collected hearts
    let heartSize = '32px';
    let heartType = '💗';
    let damage = 1;
    
    if (collectedHearts >= 8) {
        heartSize = '60px';
        heartType = '💖';
        damage = 999; // ONE SHOT
    } else if (collectedHearts >= 6) {
        heartSize = '48px';
        heartType = '💕';
        damage = 3;
    } else if (collectedHearts >= 4) {
        heartSize = '40px';
        heartType = '💗';
        damage = 2;
    }
    
    // Create player projectile
    const playerProj = {
        x: posX + 60,
        y: posY + 75,
        vx: 8,
        vy: 0,
        damage: damage,
        hearts: collectedHearts
    };
    
    playerProjectiles.push(playerProj);
    
    // Create visual element
    const projectile = document.createElement('div');
    projectile.className = 'player-projectile';
    projectile.style.left = playerProj.x + 'px';
    projectile.style.bottom = playerProj.y + 'px';
    projectile.style.fontSize = heartSize;
    projectile.textContent = heartType;
    document.getElementById('world').appendChild(projectile);
}

function updatePlayerProjectiles() {
    const projectileElements = document.querySelectorAll('.player-projectile');
    
    playerProjectiles = playerProjectiles.filter((proj, index) => {
        proj.x += proj.vx;
        
        // Update visual position
        if (projectileElements[index]) {
            projectileElements[index].style.left = proj.x + 'px';
            projectileElements[index].style.bottom = proj.y + 'px';
        }
        
        // Check collision with boss
        if (proj.x > bossX && proj.x < bossX + 100 && 
            proj.y > bossY && proj.y < bossY + 150) {
            // HIT!
            hitBoss(proj.damage, proj.hearts);
            if (projectileElements[index]) projectileElements[index].remove();
            return false;
        }
        
        // Remove if off screen
        if (proj.x > 5500) {
            if (projectileElements[index]) projectileElements[index].remove();
            return false;
        }
        
        return true;
    });
}

function hitBoss(damage, heartsUsed) {
    bossHealth -= damage;
    bossHitCooldown = 30;
    
    // Show damage message
    let message = "";
    if (heartsUsed >= 8) {
        message = "💥 ONE SHOT! 💥";
        createHeartBurst(bossX + 50, bossY + 80, 40);
    } else if (heartsUsed >= 6) {
        message = "💪 STRONG HIT! -3 💪";
        createHeartBurst(bossX + 50, bossY + 80, 20);
    } else if (heartsUsed >= 4) {
        message = "💗 GOOD HIT! -2";
        createHeartBurst(bossX + 50, bossY + 80, 12);
    } else {
        message = "✊ Hit! -1";
        createHeartBurst(bossX + 50, bossY + 80, 5);
    }
    
    showTemporaryMessage(message);
    
    // Update boss health display
    const bossHealthBar = document.getElementById('boss-health');
    if (bossHealthBar) {
        bossHealthBar.textContent = '❤️'.repeat(Math.max(0, bossHealth));
    }
    
    // Flash boss
    const bossElement = document.getElementById('boss');
    if (bossElement) {
        bossElement.style.opacity = '0.3';
        setTimeout(() => {
            if (bossElement) bossElement.style.opacity = '1';
        }, 300);
    }
    
    if (bossHealth <= 0) {
        defeatBoss();
    }
}

function showTemporaryMessage(message) {
    const msgDiv = document.createElement('div');
    msgDiv.style.position = 'fixed';
    msgDiv.style.top = '40%';
    msgDiv.style.left = '50%';
    msgDiv.style.transform = 'translate(-50%, -50%)';
    msgDiv.style.fontSize = '24px';
    msgDiv.style.fontWeight = 'bold';
    msgDiv.style.color = '#fff';
    msgDiv.style.textShadow = '3px 3px 0 #000';
    msgDiv.style.zIndex = '5000';
    msgDiv.style.pointerEvents = 'none';
    msgDiv.textContent = message;
    document.body.appendChild(msgDiv);
    
    setTimeout(() => {
        msgDiv.remove();
    }, 1500);
}

function defeatBoss() {
    bossActive = false;
    
    // Hide boss
    const bossElement = document.getElementById('boss');
    if (bossElement) {
        bossElement.style.display = 'none';
    }
    
    // Hide boss health bar
    const bossHealthContainer = document.getElementById('boss-health-container');
    if (bossHealthContainer) {
        bossHealthContainer.style.display = 'none';
    }
    
    // Remove all projectiles
    document.querySelectorAll('.boss-projectile').forEach(p => p.remove());
    document.querySelectorAll('.player-projectile').forEach(p => p.remove());
    playerProjectiles = [];
    bossProjectiles = [];
    
    // Victory message - different based on hearts collected
    const bossVictory = document.getElementById('boss-victory');
    if (bossVictory) {
        const victoryText = bossVictory.querySelector('p:nth-child(2)');
        if (victoryText) {
            if (collectedHearts === 8) {
                victoryText.textContent = 'ONE SHOT! Our love is unstoppable! 💕';
            } else {
                victoryText.textContent = 'You defeated Mr. Distance!';
            }
        }
        
        bossVictory.style.display = 'flex';
        
        setTimeout(() => {
            bossVictory.style.display = 'none';
        }, 3000);
    }
    
    // Massive celebration
    createHeartBurst(bossX + 50, bossY + 80, 30);
}

function takeDamage() {
    lives--;
    updateLives();
    bossHitCooldown = 120; // 2 seconds invincibility after taking damage
    
    // Knockback
    posX -= 100;
    velY = 20;
}

function finish() {
    isPaused = true;
    
    // Stop sparkles
    stopSparkles();
    
    // Victory dance animation!
    playerContainer.classList.add('victory');
    playerContainer.classList.remove('running', 'jumping');
    
    // Create massive heart burst!
    createHeartBurst(posX + 75, posY + 150, 20);
    
    // Fade out background music
    let fadeInterval = setInterval(() => {
        if (bgMusic.volume > 0.05) {
            bgMusic.volume -= 0.05;
        } else {
            bgMusic.pause();
            clearInterval(fadeInterval);
        }
    }, 100);
    
    // Play the victory "Good Boy" sound!
    console.log("🎉 GAME COMPLETED! Playing goodboy.mp3");
    setTimeout(() => {
        playEffect(winSound);
    }, 500);
    
    document.getElementById('final-screen').style.display = 'flex';
    const sweetNote = `Valentine’s Day is supposed to be about being together.
    Instead, it’s about believing in where we’re going.
    You’re in Arizona, building the ground we’re about to stand on.
    I’m here, holding myself steady because you showed me how.
    That space between us doesn’t scare me.
    It tells me this is real.
    I’m waiting — not because I have to,
    but because I know exactly who’s coming back for me.
    I Love You Master`;
    document.getElementById('final-msg').innerText = sweetNote;
    
    // Add bonus message if collected all hearts
    if (collectedHearts === 8) {
        const finalMsg = document.getElementById('final-msg');
        finalMsg.innerText += `\n\nP.S. You found all 8 hearts! Just like how you always find your way to mine. 💗`;
    }
}