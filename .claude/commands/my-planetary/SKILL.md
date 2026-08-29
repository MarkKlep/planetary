---
name: my-planetary
description: Provides a quick overview of the Planetary project—what it is, its purpose, and core features. Use this whenever someone asks about the project, wants to understand what this codebase does, or needs a high-level summary before diving into development.
---

# Planetary Project Overview

## What is this project?

**Planetary** is an interactive Three.js/React web application that visualizes the solar system with scientifically accurate orbital mechanics, planetary physics, and real-time data integration. It combines a 3D space simulator with educational tools for exploring celestial mechanics.

The project consists of two components:
1. **Main App** (`src/`) — the 3D solar-system visualization, and the only Vite entry point
2. **Chat backend** (`backend/`) — a small Express service streaming responses to the in-app assistant

## Purpose

Planetary serves dual purposes:

1. **Education & Visualization**: Demonstrate how orbital mechanics work in real time, showing accurate positions, rotations, and orbital paths for all bodies in the solar system
2. **Environmental Science**: Visualize real-world climate data (sea-surface temperatures) alongside the broader solar-system context that drives those patterns

The app is built to be scientifically rigorous while remaining visually engaging—nothing is fudged for appearance; everything is at true scale with real-world measurements.

## Core Features

### 3D Solar System Visualization
- **Planets & Moons**: Earth (with clouds & night-side city lights), Moon, Mars, Venus, Mercury, Jupiter with its four Galilean moons, and the Martian moons (Phobos/Deimos)
- **Live ISS Tracking**: Real-time International Space Station position updates from Open Notify API
- **True Scale**: All distances, sizes, and orbital positions are scientifically accurate (1 scene unit = 1 Earth radius)
- **Accurate Orbital Mechanics**: Keplerian orbits with proper eccentricity, inclination, and precession; tidal locking for moons
- **Dynamic Lighting**: The Sun at the origin with realistic 1/d² falloff; planetary phases and shadows work correctly

### Camera Modes
- **System View**: Zoom in and out across the solar system; focus on any celestial body with smooth flyby
- **Free Flight**: WASD + mouse to pilot; speed scales automatically based on distance to nearest body
- **Lunar Surface Mode**: Land on the Moon and walk or drive the Lunar Rover Vehicle (LRV) at true scale—see the horizon at 2.4 km just as astronauts did

### Developer-Friendly Architecture
- Built with **Vite** (fast dev server) and **React** for UI
- **Chat backend** is a separate Express service under `backend/` (independent dev/install)
- Scene graph structure that cleanly separates orbital mechanics from rendering
- Deterministic, frame-rate-independent simulation driven by a real-world date/time
- Keyboard shortcuts for quick navigation (0–9 to focus planets, F for free flight, L to land on Moon)

## How to Get Started

**Run the main 3D scene:**
```bash
npm run dev:planetary
```

**Run with the chat assistant (full stack):**
```bash
npm run dev:chat
```
This starts the 3D scene and the chat backend concurrently.

**Build for production:**
```bash
npm run build
```

See the full `npm` scripts in CLAUDE.md for more commands and detailed architecture documentation.

## Link to deployment
https://planetary-look.vercel.app/
