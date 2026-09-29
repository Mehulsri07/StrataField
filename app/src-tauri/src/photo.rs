//! Reads the date and GPS position a camera or phone saved inside a photo (EXIF).

use exif::{In, Reader, Tag, Value};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMetadata {
    /// "YYYY-MM-DD", when the camera recorded when the photo was taken.
    pub capture_date: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

/// Reads what the photo carries. Photos without EXIF (screenshots, edited images) return nothing,
/// which is normal and not an error.
pub fn read(path: &Path) -> Result<PhotoMetadata, String> {
    let file =
        std::fs::File::open(path).map_err(|e| format!("The photo could not be opened: {e}"))?;
    let exif = match Reader::new().read_from_container(&mut std::io::BufReader::new(file)) {
        Ok(exif) => exif,
        Err(_) => return Ok(PhotoMetadata::default()),
    };
    let text = |tag| {
        exif.get_field(tag, In::PRIMARY)
            .map(|f| f.display_value().to_string())
    };

    let capture_date = text(Tag::DateTimeOriginal)
        .or_else(|| text(Tag::DateTime))
        .and_then(|s| {
            // EXIF dates look like 2026:09:22 10:14:03
            let d = s.get(..10)?.replace(':', "-");
            (d.len() == 10 && d.chars().filter(|c| *c == '-').count() == 2).then_some(d)
        });

    let coord = |value_tag, ref_tag, negative: &str| -> Option<f64> {
        let field = exif.get_field(value_tag, In::PRIMARY)?;
        let Value::Rational(ref parts) = field.value else {
            return None;
        };
        if parts.len() < 3 {
            return None;
        }
        let deg = parts[0].to_f64() + parts[1].to_f64() / 60.0 + parts[2].to_f64() / 3600.0;
        let sign = match text(ref_tag) {
            Some(r) if r.trim().eq_ignore_ascii_case(negative) => -1.0,
            _ => 1.0,
        };
        let v = sign * deg;
        v.is_finite().then_some(v)
    };
    let latitude = coord(Tag::GPSLatitude, Tag::GPSLatitudeRef, "S");
    let longitude = coord(Tag::GPSLongitude, Tag::GPSLongitudeRef, "W");
    // A photo at 0,0 has no real position (some phones write zeros when GPS is off).
    let (latitude, longitude) = match (latitude, longitude) {
        (Some(la), Some(lo)) if la.abs() > 1e-6 || lo.abs() > 1e-6 => (Some(la), Some(lo)),
        _ => (None, None),
    };
    Ok(PhotoMetadata {
        capture_date,
        latitude,
        longitude,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_without_exif_returns_nothing_rather_than_an_error() {
        let dir = std::env::temp_dir().join(format!("strata-exif-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("plain.jpg");
        std::fs::write(&p, b"not really a jpeg").unwrap();
        assert_eq!(read(&p).unwrap(), PhotoMetadata::default());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_is_a_clear_error() {
        assert!(read(Path::new("C:/definitely/not/here.jpg"))
            .unwrap_err()
            .contains("could not be opened"));
    }
}
