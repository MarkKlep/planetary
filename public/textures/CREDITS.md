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
| `venus_surface.jpg` | USGS Astrogeology — Magellan C3-MDIR global radar mosaic | `Venus_Magellan_C3-MDIR_Global_Mosaic_2025m.tif`, 18775×9388, downscaled to 5400×2700 |
| `venus_height.png` | USGS Astrogeology — Magellan global topography v02 | `Venus_Magellan_Topography_Global_4641m_v02.tif`, 8192×4096, downscaled to 2700×1350 |
| `mercury_color.jpg` | USGS Astrogeology — MESSENGER MDIS global colour mosaic v3 | `Mercury_MESSENGER_ClrMosaic_global_665m_v3.tif`, 23054×11527, downscaled to 5400×2700 |
| `mercury_height.png` | USGS Astrogeology — MESSENGER global DEM v2 | `Mercury_Messenger_USGS_DEM_Global_665m_v2.tif`, 23040×11520, downscaled to 2700×1350 |

Relief and mask maps were downscaled because they carry only low-frequency detail;
the colour maps are kept at full resolution since the camera can zoom close.

`mars_height.png` is MOLA's 16-pixel-per-degree grid of 16-bit elevations in metres,
rescaled linearly onto 0–255 across its true range (−8177 m in Hellas to +21171 m at
the summit of Olympus Mons) and rolled 180°, since the PDS grid starts at 0°E while
an equirectangular texture starts at 180°W.

## The two Venus maps

`venus_surface.jpg` is **not a photograph**, and is the only map here that isn't.
Venus's cloud deck is opaque at visible wavelengths, so brightness in this map is
radar backscatter — surface roughness and slope — rather than colour. That is why it
ships greyscale and is tinted in `src/planets/venus/venus.ts` instead of carrying its
own colour: the structure is measured, the hue is not in the data at all.

`venus_height.png` is Magellan's altimetry, stored in the source as **signed** 16-bit
metres about the 6051.0 km datum (`SampleFormat = 2`; decoders that assume unsigned
clamp every lowland on the planet to zero). Rescaled linearly onto 0–255 across its
true range, −2951 m to +11687 m at the summit of Maxwell Montes.

Both grids begin at the 180° meridian, which is already where an equirectangular
texture starts, so unlike `mars_height.png` neither needed rolling. Confirmed from
the data rather than assumed: the global elevation maximum lands at 65°N, ~0–3°E
(Maxwell Montes), Ishtar Terra spans ~310°E–30°E, and Maxwell reads far brighter in
radar than the Guinevere plains — all three only true at this alignment.

Both also carry Magellan's coverage gaps — swaths the radar missed, plus a band at
each pole the mapping orbit never reached, 7.8% of the radar mosaic and 8.0% of the
topography. These are interpolated across with a push-pull pyramid, so the filled
regions are smooth inventions between real measurements rather than black scars.

## The two Mercury maps

Both source products are in **west** longitude, which an equirectangular texture is
not — so both were **mirrored**, not merely rolled. And they do not agree with each
other: the GeoTIFF `ProjCenterLong` puts the colour mosaic's centre meridian at 0° and
the DEM's at 180°, so the DEM needs a further half-turn. Used together uncorrected the
relief would have sat half a planet away from the surface it belongs to.

None of that was assumed. It was pinned by finding Rachmaninoff — the deepest point on
Mercury — in both products: the DEM's global minimum lands at 27.6°N, 57.6° from its
left edge, matching the basin's catalogued 27.6°N, 302.4°E read westward, and cropping
the colour mosaic at the predicted spot shows the same peak-ring basin centred in
frame (and at the *un*-shifted spot shows unremarkable terrain). Caloris independently
confirms it, appearing at 170° from the DEM's left edge against its catalogued 189.8°E.

`mercury_height.png` is stored in the source as **signed** 16-bit in units of **half a
metre** — the file's own `GDAL_METADATA` declares `SCALE = 0.5`, and decoding it as
plain metres doubles Mercury's topography. Rescaled linearly onto 0–255 across its
true range, −5382 m in Rachmaninoff to +4497 m, which matches the published −5.38 /
+4.48 km and is what confirmed the scale factor.

`mercury_color.jpg` has had most of its colour removed, deliberately. The published
mosaic is a stretched multiband composite with a mean saturation of 13%; the real
planet is a slightly browner Moon, with a couple of percent of genuine colour
variation. Chroma is scaled to 28% and **luminance left untouched**, so the albedo
structure — craters, ray systems, the smooth plains — is exactly as measured while the
stretch made for geologists is mostly undone. Coverage gaps (3.9%) are push-pull
filled as on Venus, and everything poleward of 82° is progressively blended into its
zonal mean, because MESSENGER's eccentric, north-pinned orbit only ever saw the poles
at grazing incidence and the mosaic degenerates into ripples and colour fringing there.

Mercury has no atmosphere texture and no atmosphere shell in the scene: at under
5×10⁻¹⁵ bar there is nothing to scatter light, so its limb ends hard, like the Moon's.

## Venus's clouds have no file here either

The deck is generated in `src/planets/venus/clouds.ts`. Not for the moons' reason —
there are plenty of Venus cloud images — but because in *visible* light there is
almost nothing on it to map. The famous dark Y-shaped markings are ultraviolet
features; pasting a UV mosaic onto a visible-light scene would draw contrast no eye
has ever seen. What is generated is the zonal banding, which is real, at the few
percent contrast that is also real.

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
