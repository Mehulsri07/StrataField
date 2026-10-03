//! Place search through Photon (photon.komoot.io), which is built on OpenStreetMap and, unlike
//! Nominatim, allows searching while the user types. Results near Lucknow are listed first.

use std::time::Duration;

const ENDPOINT: &str = "https://photon.komoot.io/api/";
const USER_AGENT: &str = concat!(
    "StrataField/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/Mehulsri07/StrataField)"
);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    latitude: f64,
    longitude: f64,
    /// The place's own name, e.g. "Vishal Khand".
    name: String,
    /// Where it is, e.g. "Gomti Nagar, Lucknow, Uttar Pradesh".
    detail: String,
}

#[derive(serde::Deserialize)]
struct Response {
    features: Vec<Feature>,
}
#[derive(serde::Deserialize)]
struct Feature {
    geometry: Geometry,
    properties: Properties,
}
#[derive(serde::Deserialize)]
struct Geometry {
    /// Longitude first, then latitude.
    coordinates: [f64; 2],
}
#[derive(serde::Deserialize)]
struct Properties {
    name: Option<String>,
    housenumber: Option<String>,
    street: Option<String>,
    locality: Option<String>,
    district: Option<String>,
    city: Option<String>,
    county: Option<String>,
    state: Option<String>,
}

/// Up to six places matching `query`, best first. Results are approximate; screens must say so.
pub async fn search(query: &str) -> Result<Vec<Place>, String> {
    let query = query.trim();
    if query.chars().count() < 3 {
        return Ok(Vec::new());
    }
    if query.chars().count() > 200 {
        return Err("Type a shorter place or address to search for.".into());
    }
    // One client for the whole session: the connection stays open between searches, so each
    // answer after the first skips the handshake.
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let client = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_default()
    });
    let found: Response = client
        .get(ENDPOINT)
        .query(&[
            ("q", query),
            ("limit", "6"),
            ("lang", "en"),
            // Prefer places near the centre of Lucknow.
            ("lat", "26.85"),
            ("lon", "80.95"),
            ("zoom", "10"),
            ("location_bias_scale", "0.2"),
        ])
        .send()
        .await
        .map_err(|_| "Searching for a place needs an internet connection. You can still click the spot on the map.".to_string())?
        .error_for_status()
        .map_err(|e| format!("The place search did not answer ({e}). Try again later, or click the spot on the map."))?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(found.features.into_iter().map(place).collect())
}

fn place(f: Feature) -> Place {
    let p = f.properties;
    let street = match (p.housenumber, p.street) {
        (Some(n), Some(s)) => Some(format!("{n} {s}")),
        (_, s) => s,
    };
    // Name first, then ever wider surroundings, without repeats ("Lucknow, Lucknow").
    let mut parts: Vec<String> = Vec::new();
    for part in [
        p.name, street, p.locality, p.district, p.city, p.county, p.state,
    ]
    .into_iter()
    .flatten()
    {
        if !part.trim().is_empty() && !parts.contains(&part) {
            parts.push(part);
        }
    }
    let name = if parts.is_empty() {
        "Unnamed place".to_string()
    } else {
        parts.remove(0)
    };
    Place {
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        name,
        detail: parts.join(", "),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_place_is_named_once_and_latitude_comes_from_the_second_coordinate() {
        let found: Response = serde_json::from_str(
            r#"{"features":[{"geometry":{"coordinates":[80.94,26.85],"type":"Point"},
                "properties":{"name":"Hazratganj","district":"Hazratganj","city":"Lucknow","county":"Lucknow","state":"Uttar Pradesh"}}]}"#,
        )
        .unwrap();
        let p = place(found.features.into_iter().next().unwrap());
        assert_eq!((p.latitude, p.longitude), (26.85, 80.94));
        assert_eq!(p.name, "Hazratganj");
        assert_eq!(p.detail, "Lucknow, Uttar Pradesh");
    }
}
