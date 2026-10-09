---

name: fps-game-dev
description: Build, improve, debug, and maintain the existing browser-based tactical FPS game, including 3D graphics, enemy AI, shooting, player health, mouse sensitivity, settings, and testing.
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# FPS Game Development Skill

## Purpose

Use this skill whenever working on my existing browser-based 3D first-person shooter game.

The goal is to maintain and improve a polished tactical FPS inspired by the general visual style and gameplay of Valorant, while using original designs and assets.

## 1. Rules Before Making Changes

* Inspect the existing project files before editing.
* Understand the current game loop, scene, camera, player controller, enemies, weapons, and HUD.
* Preserve all working features.
* Modify existing code rather than rebuilding the entire project.
* Implement the user's requested feature directly; do not stop after writing a plan.
* Make small, focused changes to conserve model usage.
* Avoid unnecessary dependencies, files, abstractions, and long explanations.
* Never claim that a feature works or a test passed without verifying it.
* If the project is incomplete, prioritize making the current game playable.

## 2. Technology

Use the project's existing stack:

* HTML
* CSS
* JavaScript
* Three.js
* Vite

Do not introduce React, TypeScript, a backend, multiplayer, or a database unless explicitly requested.

Use procedural geometry, materials, lighting, and lightweight effects where practical.

Do not copy proprietary Valorant maps, characters, logos, weapon models, or assets.

## 3. Graphics and Environment

Maintain a polished tactical sci-fi arena featuring:

* Detailed floors, walls, pillars, crates, barriers, and cover.
* Distinct materials and surface colors.
* Atmospheric lighting, ambient light, and directional lights.
* Glowing accents and environmental details.
* Shadows and fog where appropriate.
* Bullet impact effects, sparks, and lightweight particles.
* Clear visual contrast between enemies and the environment.

Improve the existing environment incrementally. Avoid excessive objects and effects that reduce performance.

## 4. Player Movement

Support:

* W: Forward.
* S: Backward.
* A: Move left.
* D: Move right.
* Mouse: Look around.
* Space: Jump.
* Shift: Sprint.
* Escape: Release pointer lock or pause.

Maintain appropriate movement speed, gravity, ground detection, and collisions.

The player must not walk through major walls or obstacles.

Mouse sensitivity must not change player movement speed.

## 5. Mouse Sensitivity and Settings

Provide a functional settings menu with:

* Mouse sensitivity slider from 0.1 to 3.0.
* Default sensitivity of 1.0.
* Slider increments of 0.1.
* Immediate sensitivity updates.
* Horizontal and vertical sensitivity control using the same setting.
* Camera pitch limits.
* Persistent preferences using localStorage.
* A reset-to-default option.

Ensure mouse movement is multiplied by the sensitivity setting in the actual camera controller.

If graphics settings exist, Low, Medium, and High must change actual rendering effects.

Do not add decorative controls that do nothing.

## 6. Weapon and Shooting

Maintain a visible first-person rifle with:

* Shooting using the left mouse button.
* Center-screen crosshair.
* Raycast-based hit detection.
* Shooting cooldown.
* Visible muzzle flash and recoil.
* Bullet tracers and impact particles where practical.
* Reloading using R.
* Ammunition display.
* Hit markers and kill feedback.

Ensure shooting direction matches the center of the player's camera.

Avoid allowing the weapon model to interfere with target detection.

## 7. Enemy AI

Enemies must be active and capable of fighting the player.

Use a simple state-based system:

* Patrol: Move around when the player is not detected.
* Chase: Pursue the player when detected.
* Attack: Fire when within range.
* Dead: Stop moving and attacking.

Enemies should:

* Have health and take damage.
* Turn toward the player.
* Move rather than remain stationary.
* Avoid obvious obstacles where practical.
* Attack at a suitable range.
* Have a cooldown between attacks.
* Stop attacking immediately after death.
* Display appropriate hit and death effects.

Use simple movement steering instead of complicated pathfinding unless necessary.

Prevent enemies from getting stuck against walls where practical.

## 8. Enemy Projectiles and Player Damage

Enemies must shoot visible projectiles toward the player.

* Give projectiles a distinct color.
* Move projectiles toward the player's position.
* Detect collisions with the player.
* Remove projectiles when they hit something or travel too far.
* Prevent projectiles from damaging their owner.
* Respect arena walls and major obstacles where practical.

Player health:

* Maximum health: 100 HP.
* Starting health: 100 HP.
* Each successful enemy projectile hit: 10 damage.
* Health cannot exceed 100 or fall below zero.
* Use a short invulnerability period after a hit to prevent instant repeated damage.
* Update the health bar immediately.
* Provide red screen-edge damage feedback.

A missed projectile must not damage the player.

## 9. Game State and Waves

Preserve existing gameplay systems, including:

* Enemy count and kill score.
* Wave progression, if implemented.
* Health and ammunition HUD.
* Pause and resume.
* Game-over screen.
* Restart button.

When the player reaches zero health:

* Stop player movement and enemy attacks.
* Show GAME OVER.
* Display available statistics, such as kills and wave reached.
* Allow a fresh restart.

Restart must reset health, enemies, projectiles, ammunition, score, and wave state as appropriate.

Do not create duplicate game loops or duplicate event listeners.

## 10. User Interface

Maintain a clear tactical shooter interface with:

* Start menu.
* Play button.
* Settings menu.
* Center crosshair.
* Health bar.
* Ammo counter.
* Reload indicator.
* Wave and enemy counters.
* Kill score.
* Pause screen.
* Game-over screen.
* Restart and resume controls.

Use readable typography, consistent spacing, and restrained visual effects.

Ensure menus do not interfere with gameplay input.

## 11. Performance and Code Quality

* Reuse the existing renderer, scene, camera, and animation loop.
* Use delta time for frame-rate-independent movement and animations.
* Limit the number of active enemies and particles.
* Clean up temporary projectiles and particle objects.
* Dispose of unused GPU resources where appropriate.
* Avoid expensive effects when simpler alternatives work.
* Keep functions focused and code understandable.
* Fix the root cause of errors instead of repeatedly rewriting complete files.

## 12. Required Workflow for Every Task

When the user requests a feature or fix:

1. Inspect the relevant files.
2. Identify the smallest safe change.
3. Implement the requested feature.
4. Integrate it with existing systems.
5. Run npm run build when available.
6. Fix errors caused by the changes.
7. Verify the relevant behavior as far as the available tools allow.
8. Summarize modified files, checks performed, and any remaining limitations.

Do not claim that browser gameplay was tested if only the production build was run.

## 13. Priority Order

If time, context, or model usage is limited, prioritize:

1. Working gameplay and stable execution.
2. Correct player movement and aiming.
3. Working weapon and hit detection.
4. Moving enemies and enemy attacks.
5. Player health and damage.
6. Mouse sensitivity and settings persistence.
7. Graphics, animations, and visual effects.
8. Optional audio and polish.

Implement a simple working version before attempting complex enhancements.

## Final Rule

Always apply these instructions when modifying this FPS project. Preserve existing functionality, implement the requested changes directly, minimize unnecessary code, and verify the result honestly.
