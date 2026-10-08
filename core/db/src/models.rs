//! Records exchanged with the screens. Field names match `core/src/types.ts` (camelCase).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Borewell {
    pub id: String,
    pub project_id: Option<String>,
    /// Project name, joined for display.
    pub project: String,
    pub borewell_id: String,
    pub owner_name: String,
    pub house_no: String,
    pub area: String,
    pub city: String,
    pub address: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub location_source: String,
    pub location_accuracy_m: Option<f64>,
    pub ground_elevation_m: Option<f64>,
    pub elevation_source: Option<String>,
    pub bore_dia: Option<f64>,
    pub pipe_dia: Option<f64>,
    pub total_depth: Option<f64>,
    pub water_level: Option<f64>,
    pub dynamic_water_level: Option<f64>,
    pub depth_unit: String,
    pub drilling_method: Option<String>,
    pub record_quality: String,
    pub remarks: String,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
    pub import_batch_id: Option<String>,
    pub import_source: Option<String>,
    pub import_method: String,
    pub deleted_at: Option<String>,
    /// When the water level was measured: the newest reading's date, or the drilling date when
    /// there are no readings. `None` without a water level.
    pub water_level_on: Option<String>,
    /// The kind of pump, e.g. "Borewell submersible, 4 inch (100 mm)". Empty when not recorded.
    pub pump_type: String,
    /// The model, e.g. "12C/17". Records from before the maker had its own box may still have the
    /// maker written here as well ("KSB 12C/17").
    pub pump_model: String,
    /// The company that made the pump, e.g. "KSB".
    pub pump_make: String,
    pub pump_hp: Option<f64>,
    /// "Single phase" or "Three phase". Empty when not recorded.
    pub pump_phase: String,
    /// How deep the pump hangs, in feet below ground.
    pub pump_lowering: Option<f64>,
    /// The pipe the pump hangs on and the water comes up through: its size in millimetres.
    pub column_pipe_dia: Option<f64>,
    /// "PVC" or "MS" (mild steel). Empty when not recorded.
    pub column_pipe_material: String,
}

/// What a screen sends to create or update a borewell. The project is given by name;
/// a new name creates the project.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BorewellInput {
    pub project: String,
    pub borewell_id: String,
    pub owner_name: String,
    pub house_no: String,
    pub area: String,
    pub city: String,
    pub address: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub location_source: Option<String>,
    pub location_accuracy_m: Option<f64>,
    pub ground_elevation_m: Option<f64>,
    pub elevation_source: Option<String>,
    pub bore_dia: Option<f64>,
    pub pipe_dia: Option<f64>,
    pub total_depth: Option<f64>,
    pub water_level: Option<f64>,
    pub dynamic_water_level: Option<f64>,
    pub depth_unit: Option<String>,
    pub drilling_method: Option<String>,
    pub record_quality: Option<String>,
    pub remarks: String,
    pub date: String,
    pub import_batch_id: Option<String>,
    pub import_source: Option<String>,
    pub import_method: Option<String>,
    pub pump_type: String,
    pub pump_model: String,
    pub pump_make: String,
    pub pump_hp: Option<f64>,
    pub pump_lowering: Option<f64>,
    pub pump_phase: String,
    pub column_pipe_dia: Option<f64>,
    pub column_pipe_material: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct StrataLayer {
    pub id: String,
    pub borewell_id: String,
    pub start_depth: f64,
    pub end_depth: f64,
    pub material: String,
    pub material_id: Option<String>,
    pub color: String,
    pub pattern: String,
    pub remarks: String,
    pub water_bearing: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PipeSegment {
    pub id: String,
    pub borewell_id: String,
    pub start_depth: f64,
    pub end_depth: f64,
    pub pipe_type: String,
    pub pipe_subtype: Option<String>,
    pub diameter: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WaterReading {
    pub id: String,
    pub borewell_id: String,
    pub measured_on: String,
    pub static_level: Option<f64>,
    pub dynamic_level: Option<f64>,
    pub source: String,
    pub remarks: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub borewell_id: String,
    /// Absolute path, resolved against the data folder.
    pub file_path: String,
    pub capture_date: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub caption: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub borewell_id: String,
    pub kind: String,
    /// Absolute path, resolved against the data folder.
    pub file_path: String,
    pub original_name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub name: String,
    pub color: String,
    pub pattern: String,
    #[serde(default)]
    pub is_custom: bool,
    pub lithology_class: Option<String>,
    pub lithology_family: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub borewell_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub entity: String,
    pub entity_id: String,
    pub action: String,
    pub changed_at: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub name: String,
    /// Line points as [latitude, longitude].
    pub line: Vec<[f64; 2]>,
    pub corridor_half_km: f64,
    pub settings: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

/// Everything about one borewell, for the detail screen.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BorewellRecord {
    pub borewell: Borewell,
    pub strata: Vec<StrataLayer>,
    pub pipes: Vec<PipeSegment>,
    pub water_readings: Vec<WaterReading>,
    pub photos: Vec<Photo>,
    pub files: Vec<Attachment>,
    pub history: Vec<HistoryEntry>,
}

/// One row of the Borewells list, with its layers for the small layer strip.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BorewellListItem {
    pub borewell: Borewell,
    pub strata: Vec<StrataLayer>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchFilters {
    pub query: String,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub project: Option<String>,
    pub material_id: Option<String>,
    pub min_depth: Option<f64>,
    pub max_depth: Option<f64>,
    pub min_water_level: Option<f64>,
    pub max_water_level: Option<f64>,
    pub no_location: bool,
    /// true lists the Recycle bin instead of active records.
    pub show_deleted: bool,
}
