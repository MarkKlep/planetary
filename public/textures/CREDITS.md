# Texture credits

Every map here is NASA imagery and in the **public domain** (NASA media are not
copyrighted) — with exactly one exception, `saturn_color.jpg`, which is CC BY 4.0 and
is called out separately below. For everything else, credit is courtesy rather than a
licence requirement.

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
| `jupiter_color.jpg` | NASA/JPL/Space Science Institute — Cassini ISS cylindrical map (PIA07782) | 3601×1801, resampled to 3600×1800 |
| `io_color.jpg` | USGS Astrogeology — Galileo SSI / Voyager colour-merge global mosaic | `Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif`, 11445×5723, downscaled to 4096×2048 |
| `europa_color.jpg` | USGS Astrogeology — Voyager / Galileo SSI global mosaic | `Europa_Voyager_GalileoSSI_global_mosaic_500m.tif`, 19631×9816, downscaled to 4096×2048 |
| `ganymede_color.jpg` | USGS Astrogeology — Voyager / Galileo SSI global colour mosaic | `Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif`, 11520×5760, downscaled to 4096×2048 |
| `callisto_color.jpg` | USGS Astrogeology — Voyager / Galileo SSI global mosaic | `Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif`, 15138×7569, downscaled to 4096×2048 |
| `saturn_color.jpg` | **Solar System Scope, CC BY 4.0** — see below | 4096×2048, unmodified |
| `mimas_color.jpg` | NASA/JPL/SSI/LPI — Cassini ISS global map (PIA17214, P. Schenk) | 5760×2880 at 16 px/deg, rolled 180°, downscaled to 4096×2048 |
| `enceladus_color.jpg` | USGS Astrogeology — Cassini ISS global mosaic | `Enceladus_Cassini_mosaic_global_110m.tif`, 14401×7201, downscaled to 4096×2048 |
| `tethys_color.jpg` | USGS Astrogeology — Cassini ISS global mosaic | `Tethys_Cassini_mosaic_global_293m.tif`, 11520×5760, downscaled to 4096×2048 |
| `dione_color.jpg` | USGS Astrogeology — Cassini / Voyager global mosaic | `Dione_Cassini_Voyager_mosaic_global_154m.tif`, 23040×11520, downscaled to 4096×2048 |
| `rhea_color.jpg` | USGS Astrogeology — Cassini / Voyager global mosaic | `Rhea_Cassini_Voyager_mosaic_global_417m.tif`, 11520×5760, downscaled to 4096×2048 |
| `titan_color.jpg` | USGS Astrogeology — Cassini ISS global mosaic, 938 nm | `Titan_ISS_P19658_Mosaic_Global_4km.tif`, 4040×2020, rolled 180°, resampled to 2048×1024 |
| `iapetus_color.jpg` | USGS Astrogeology — Cassini / Voyager global mosaic | `Iapetus_Cassini_Voyager_mosaic_global_783m.tif`, 5760×2880, downscaled to 4096×2048 |

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

## Jupiter is a snapshot, not a survey

`jupiter_color.jpg` is the one colour map here that will be *wrong* in ten years, and
it was already slightly wrong when it was taken. Every other map describes ground that
has not moved in a geological age. Jupiter has no ground: the belts and zones are
weather, they shear past one another continuously, and the Great Red Spot has both
shrunk and drifted in longitude since Cassini shot these frames in December 2000. What
survives is the character of the banding, which is why it is still the right map to
use — but nothing in the scene claims a feature is at a particular longitude today.

That is also why no attempt is made to register it precisely. A gas giant's prime
meridian is the **System III** magnetic convention (see `JUPITER_ROTATION_DEG_PER_DAY`),
and the visible cloud features drift relative to it by degrees per year — so pinning
the map to arcseconds would be claiming a precision the subject does not have.

The poles are Cassini's weakest ground. The flyby was near-equatorial, so real banding
runs out around ±58° and the mosaic is smoothed filler beyond it, ending in a flat fill
at the last few rows. Latitudes poleward of 58° are progressively blended into their
own zonal means, reaching a pure zonal mean by 78°, so the caps close as smooth
latitude-coloured discs rather than showing the fill's edge — the same treatment
Mercury's poles get above, for the same reason.

## The Galilean moons, and which way round they go

All four USGS products are ISIS mosaics, and the trap they carry is the **opposite** of
Mercury's. Three of the four label their longitudes `PositiveWest` (Io, Europa,
Callisto; Ganymede is `PositiveEast`), which looks like it should mean the same
mirroring the two Mercury maps needed. It does not: ISIS lays the image out with X
increasing **east** regardless, so `LongitudeDirection` changes how longitudes are
*numbered* and not which way the picture runs. None of the four is mirrored. Only the
left edge differs:

| File | Source layout | Transform |
|---|---|---|
| `io_color.jpg` | centre 0°, domain 180 | none — left edge is already 180°E |
| `europa_color.jpg` | centre 180°, domain 360 | rolled 180° |
| `ganymede_color.jpg` | centre 180°, domain 360 | rolled 180° |
| `callisto_color.jpg` | centre 180°, domain 360 | rolled 180° |

None of that was taken on trust — mirroring was in fact applied first, on the reading
above, and then removed when the landmarks disagreed. Each map is pinned by a feature
whose coordinates are catalogued, checked against the position the scene's own
convention predicts (left edge 180°E, increasing east, from three.js's sphere UVs
composed with `geo.ts`):

| Body | Landmark | Catalogued | Lands at |
|---|---|---|---|
| Io | Pele, and its red sulphur ring | 18.7°S, 255.3°W | 18.7°S, 255°W |
| Europa | Pwyll, bright ray crater | 25°S, 271°W | 25°S, 271°W |
| Ganymede | Galileo Regio, the big dark plate | 35°N, 145°W | 37°N, 145°W |
| Callisto | Valhalla, the multi-ring bullseye | 16.1°N, 55.3°W | 16°N, 56°W |

## Europa's and Callisto's colour is a tint, not data

Both ship **greyscale**, for the same reason `venus_surface.jpg` does: the global
product that exists is a brightness mosaic, not a colour one. So the structure is
measured and the hue is not in the data at all — it comes from a material tint in
`src/planets/jupiter/moons.ts`, taken from Galileo's colour work (Europa's
sulphur-stained trailing hemisphere, Callisto's dark ice-poor residue).

Io and Ganymede do carry real colour and are not tinted for hue. All four are tinted
for *brightness*, because none of the mosaics is radiometrically absolute and the
albedos genuinely span 0.22 to 0.67 — the widest range of any family of bodies in this
scene. The derivation is in `moons.ts`.

There are no height maps for any of the four, and that is a gap rather than a choice:
Voyager and Galileo flew past rather than orbited, so outside a few stereo patches
there is no global altimetry to wrap.

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

## Saturn's globe is the one map here that is not NASA's

`saturn_color.jpg` comes from **Solar System Scope** (solarsystemscope.com/textures)
and is licensed **CC BY 4.0**, not public domain. It is derived from NASA/JPL Cassini
imagery, but it is a derived work and the attribution above is a licence condition
rather than a courtesy.

It is here because there is no equivalent to fall back on. Every other planet in this
scene has a registered global mosaic published by USGS Astrogeology or the PDS; Saturn
does not. The Cassini imaging team produced plenty of Saturn maps, but they are figures
in papers and Photojournal releases rather than a cylindrical product with a projection
label, and none of them is a single global map at a usable resolution.

That matters less for Saturn than it would for anywhere else. Saturn's visible
appearance is very nearly a function of latitude alone — the belts and zones are seen
through a haze deep enough to mute their contrast to about a fifth of Jupiter's, and
there is no long-lived feature like the Great Red Spot to register against. So nothing
in the scene claims a longitude for anything on Saturn, exactly as nothing does for
Jupiter, and for a stronger reason.

## The Saturnian moons, and which way round they go

Six of the seven are USGS ISIS mosaics carrying the same trap the Galilean maps do, and
the same resolution: `LongitudeDirection` changes how longitudes are *numbered*, not
which way the picture runs, and none of the six is mirrored. The left edge is read off
each label's `UpperLeftCornerX` and `CenterLongitude` rather than assumed:

| File | Left edge in its own numbering | Transform |
|---|---|---|
| `enceladus_color.jpg` | 180° | none — already the scene's left edge |
| `tethys_color.jpg` | −180° | none |
| `dione_color.jpg` | −180° | none |
| `rhea_color.jpg` | 180° | none |
| `titan_color.jpg` | 0° | rolled 180° |
| `iapetus_color.jpg` | −180° | none |

`mimas_color.jpg` is the odd one out: it is a JPL Photojournal release with no PDS label
to read, so it was pinned by a landmark instead.

Every one was then checked against a catalogued feature, rather than trusted:

| Body | Landmark | Catalogued | Lands at |
|---|---|---|---|
| Mimas | Herschel, the 130 km crater | 0.4°N, 111.2°W | 0°N, 105°W (needed the 180° roll; unrolled it fell at 285°W) |
| Tethys | Odysseus, the 450 km basin | 32.8°N, 130°W | 130°W |
| Rhea | Inktomi, bright ray crater | 14.1°S, 112.1°W | 113°W |
| Titan | Xanadu, the bright highland | ~10°S, 80–140°W | peak brightness at 122°W |
| Iapetus | Cassini Regio, the dark hemisphere | centred 90°W | leading side 20% darker than trailing, brightest at 90°E |
| Dione | wispy terrain, trailing hemisphere | centred 90°E | leading side 4% brighter, as measured |
| Enceladus | — | — | not checkable: it is uniform to 3% at every longitude |

Enceladus is the honest gap. It is the most uniformly bright surface in the solar system
and has no albedo feature large enough to pin a rotation against at map scale, so its
orientation rests on its label alone — which is the same label format as Rhea's, and
Rhea's is confirmed by Inktomi to a degree.

All six ship **greyscale**, for the reason `venus_surface.jpg` and the two greyscale
Galileans do: the global products that exist are brightness mosaics. The five icy moons
are genuinely near-neutral in colour, so they are tinted only for *brightness*. Iapetus
and Titan carry a hue as well, and both are noted as tints rather than data in
`src/planets/saturn/moons.ts` and `titan.ts`.

## Titan's two maps, and why one of them is not colour

`titan_color.jpg` is the same situation as `venus_surface.jpg` from the other direction.
Titan's haze is opaque in visible light, so this mosaic was taken at **938 nm**, in a
narrow window between methane absorption bands where the haze happens to be thin enough
to see through. It is not a photograph of Titan and it is not what Titan looks like: it
is the ground under the smog, which nothing saw at all until Cassini arrived in 2004.

So Titan gets Venus's treatment — two shells. This map is the surface, and what Titan
actually looks like is generated in `src/planets/saturn/haze.ts`. There is no file for
the haze for Venus's reason exactly: there are plenty of images of Titan, and there is
essentially nothing *on* it to map. What visible-light imaging shows is a faint
north-south asymmetry that reverses over Titan's 29½-year seasons, a darker polar hood,
and the detached haze at the limb. That is all of it.

It is also kept at half the width of the other mosaics, which is not a corner cut: the
source is 4 km/pixel — a twentieth of the ground resolution of the icy moons' maps —
because it was shot through an atmosphere.

## Saturn's rings have no file here

They are generated in `src/planets/saturn/rings.ts`, and unlike Venus's clouds or
Phobos's relief that is the *stronger* option rather than a fallback.

The rings are a one-dimensional object. There is no longitude structure worth mapping —
the particles are on independent circular orbits and shear any azimuthal feature out
within hours — so what the subject actually is, is a radial profile. What is generated
from measured data is that profile: Cassini-era boundary radii good to a few kilometres,
and normal optical depths from UVIS and RSS occultations.

And a photograph would be worse for a specific reason. The rings' appearance depends
entirely on where the Sun and the observer are relative to the ring plane — from the
sunlit side the B ring is the brightest thing in the system, and from the unlit side it
is nearly black while the C ring and the Cassini Division become the brightest. Baking
one of those into an image would fix the answer to a question this scene can ask,
because it knows where the Sun is. So the file carries optical depths and the appearance
comes out of them.

Sub-kilometre structure between the tabulated boundaries — the B ring's several hundred
unexplained bands, the C ring's ringlets and plateaux — is fractal, on the same terms
Phobos's relief is: measured where measurements exist, generated below them.
