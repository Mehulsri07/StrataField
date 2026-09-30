//! Address lookup through OpenStreetMap Nominatim, with a local cache.
//! Nominatim's usage policy: at most one request per second and an identifying User-Agent.

use crate::state::AppState;
use std::time::{Duration, Instant};
use strata_db::repo::misc::{self, GeocodeHit};

const ENDPOINT: &str = "https://nominatim.openstreetmap.org/search";
const USER_AGENT: &str = concat!(
    "StrataField/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/Mehulsri07/StrataField)"
);
const MIN_GAP: Duration = Duration::from_secs(1);

#[derive(serde::Deserialize)]
struct NominatimPlace {
    lat: String,
    lon: String,
    display_name: String,
}

/// Returns the best match for `query`, or `None` if nothing was found.
/// Results are approximate; screens must label them as such.
pub async fn lookup(state: &AppState, query: &str) -> Result<Option<GeocodeHit>, String> {
    let db = state.db()?;
    let query = query.trim();
    if query.chars().count() > 200 {
        return Err("Type a shorter address to look up.".into());
    }
    if query.len() < 3 {
        return Err("Type a longer address to look up.".into());
    }
    if let Some(hit) = db
        .with(|c| misc::cached_geocode(c, query))
        .map_err(|e| e.to_string())?
    {
        return Ok(Some(hit));
    }

    {
        // Space lookups at least a second apart, as the usage policy requires.
        let mut last = state.geocode_gate.lock().await;
        if let Some(t) = *last {
            let since = t.elapsed();
            if since < MIN_GAP {
                tokio::time::sleep(MIN_GAP - since).await;
            }
        }
        *last = Some(Instant::now());
    }

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let places: Vec<NominatimPlace> = client
        .get(ENDPOINT)
        .query(&[("q", query), ("format", "jsonv2"), ("limit", "1"), ("countrycodes", "in")])
        .send()
        .await
        .map_err(|_| "Address lookup needs an internet connection. You can pick the location on the map instead.".to_string())?
        .error_for_status()
        .map_err(|e| format!("The address lookup service did not answer ({e}). Try again later or pick the location on the map."))?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let Some(place) = places.into_iter().next() else {
        return Ok(None);
    };
    let (Ok(latitude), Ok(longitude)) = (place.lat.parse::<f64>(), place.lon.parse::<f64>()) else {
        return Ok(None);
    };
    let hit = GeocodeHit {
        latitude,
        longitude,
        display_name: place.display_name,
    };
    db.with(|c| misc::cache_geocode(c, query, &hit))
        .map_err(|e| e.to_string())?;
    Ok(Some(hit))
}
