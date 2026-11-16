# Ratings, sorting and the deals map

## Ratings

- A student can rate a business (1 to 5 stars, optional comment up to 500 characters) only after a discount there **completed**. One rating per student per business; they can change or remove it.
- Others see the first name and initial only ("Ama M."). Shops get a notification for each new rating and see them under **Business → Reviews**.
- Perqly support can hide a rating that breaks the rules (Admin → Businesses → the business → Student ratings). Hidden ratings leave the average; hiding is audited.
- Students rate from the shop page, or from **My deals** ("Rate …" under each visit).

## Sorting

Home has **Nearest** (default), **Top rated**, **New** (when the deal went live) and **Hot deals** (biggest share off the normal price).

## Map

- **Map** tab: one pin per branch with live deals, showing its best saving; the student's campus is the blue dot. "Where am I?" uses the phone's location only to move the map; nothing is saved.
- Tiles come from OpenStreetMap (`tile.openstreetmap.org`, allowed in the CSP). That service is free for light use; if traffic grows, switch to a paid tile provider (MapTiler, Stadia, Mapbox) by changing the tile URL in `src/features/students/app/deal-map.tsx` and the CSP.
- Shops appear on the map only once a branch has a pinned location.

Code: `supabase/migrations/20261114090028_ratings_and_map.sql`, `src/features/reviews/`, `src/app/student/map/`. Tests: `supabase/tests/025_ratings_map_test.sql`.
