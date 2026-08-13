# Texture credits

All maps here are NASA imagery and are in the **public domain** (NASA media are not
copyrighted). Credit is courtesy, not a licence requirement.

| File | Source | Original |
|---|---|---|
| `earth_day.jpg` | NASA Earth Observatory — Blue Marble Next Generation (Reto Stöckli) | `world.topo.bathy.200412.3x5400x2700.jpg`, 5400×2700 |
| `earth_night.jpg` | NASA Earth Observatory — Black Marble 2016 | `BlackMarble_2016_01deg.jpg`, 3600×1800 |
| `earth_clouds.jpg` | NASA Earth Observatory — MODIS cloud composite | `cloud_combined_2048.jpg`, 2048×1024 |
| `earth_height.jpg` | NASA / GEBCO topography (Blue Marble Next Generation) | `gebco_08_rev_elev_5400x2700.jpg`, downscaled to 2700×1350 |
| `earth_landmask.jpg` | NASA / GEBCO bathymetry — used as a land/water mask | `gebco_08_rev_bath_5400x2700.jpg`, downscaled to 2700×1350 |
| `moon_color.jpg` | NASA SVS — CGI Moon Kit, LROC colour | `lroc_color_poles_4k.tif`, 4096×2048 |
| `moon_height.png` | NASA SVS — CGI Moon Kit, LOLA elevation | `ldem_4_uint.tif`, 1440×720 |
| `mars_color.jpg` | USGS Astrogeology — Viking MDIM 2.1 colour mosaic, via NASA Mars Trek | `Mars_Viking_MDIM21_ClrMosaic_global_232m`, tiled at 8192×4096 |
| `mars_height.png` | NASA PDS — MGS MOLA MEGDR global topography | `megt90n000eb.img`, 5760×2880 |

Relief and mask maps were downscaled because they carry only low-frequency detail;
the colour maps are kept at full resolution since the camera can zoom close.

`mars_height.png` is MOLA's 16-pixel-per-degree grid of 16-bit elevations in metres,
rescaled linearly onto 0–255 across its true range (−8177 m in Hellas to +21171 m at
the summit of Olympus Mons) and rolled 180°, since the PDS grid starts at 0°E while
an equirectangular texture starts at 180°W.

## Phobos and Deimos have no files here

They are generated in `src/planets/mars/moons.ts` rather than textured, because
neither is a sphere and there is nothing sensible to wrap a rectangular map onto. The
figures they are built from are still measured, not invented:

| Quantity | Source |
|---|---|
| Triaxial radii — 13.1 × 11.1 × 9.3 km and 7.8 × 6.0 × 5.1 km | JPL Horizons satellite physical data |
| Geometric albedo 0.068 | JPL Horizons |
| Stickney: 9.5 km across, ~2 km deep, at 1°N 49°W | USGS Gazetteer of Planetary Nomenclature / Viking |
| Orbits (see `src/orbits.ts`) | fitted to JPL's MAR099 ephemeris, 2000–2030 |

The relief between those landmarks is fractal noise and a synthetic crater
population, so the *shapes* are plausible rather than surveyed. Only the overall
figure, the albedo and Stickney are real.
