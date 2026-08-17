# Planetary

An interactive Three.js/React web application that visualizes the solar system with scientifically accurate orbital mechanics, planetary physics, and real-time data integration.

**🚀 [Try it live](https://planetary-look.vercel.app/)**

![Solar system view](public/screenshots/solar-system.png)

## What is it?

Planetary combines a 3D space simulator with educational tools for exploring celestial mechanics and environmental science. Everything is built to be scientifically rigorous while remaining visually engaging—nothing is fudged for appearance; everything is at true scale with real-world measurements.

The app consists of two main experiences:
1. **3D Solar System** — Interactive visualization of the solar system with accurate orbital mechanics
2. **Heatmap Viewer** — Sea-surface-temperature data visualization

## Core Features

### 🌍 3D Solar System Visualization
- **Planets & Moons**: Earth (with clouds & night-side city lights), Moon, Mars, Venus, Mercury, Jupiter with its four Galilean moons, and the Martian moons (Phobos/Deimos)
- **Live ISS Tracking**: Real-time International Space Station position updates
- **True Scale**: All distances, sizes, and orbital positions are scientifically accurate (1 scene unit = 1 Earth radius)
- **Accurate Orbital Mechanics**: Keplerian orbits with proper eccentricity, inclination, and precession; tidal locking for moons
- **Dynamic Lighting**: Realistic 1/d² falloff; planetary phases and shadows work correctly

![Earth close-up](public/screenshots/earth-moon.png)

### 🎮 Camera Modes
- **System View**: Zoom in and out across the solar system; focus on any celestial body with smooth flyby
- **Free Flight**: WASD + mouse to pilot; speed scales automatically based on distance to nearest body
- **Lunar Surface Mode**: Land on the Moon and walk or drive the Lunar Rover Vehicle (LRV) at true scale—see the horizon at 2.4 km just as astronauts did

![Lunar surface at Tranquility Base](public/screenshots/lunar-surface.png)

### 🌡️ Environmental Data Integration
- **Heatmap Visualization**: Sea-surface-temperature data displayed on an interactive map
- **Palette Selection**: Choose from multiple color schemes (viridis, turbo, spectral)
- **Real Data Processing**: Reads binary SST grid files and rasterizes them with proper sampling

## Navigation

Once you're in the app:
- **0–9** — Focus on specific planets/bodies
- **F** — Free flight mode
- **L** — Land on the Moon
- **W/A/S/D/Q/E** — Flight controls (in free flight mode)
- **Mouse** — Look around / orbit control

## Architecture

Built with:
- **Three.js** — 3D graphics and orbital mechanics
- **React** — UI and component structure
- **Vite** — Fast development server

The main 3D scene and heatmap sub-app work independently and can be deployed separately.
